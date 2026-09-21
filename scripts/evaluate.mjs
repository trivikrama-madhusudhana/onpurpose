#!/usr/bin/env node
/** Opt-in paid evaluation. Credentials are passed to curl on stdin, never its argv. */
import { buildRequest, parseDecision, RUBRIC_VERSION, MODEL, ENDPOINT } from '../src/jev.js';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const canonical = value => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
const readJSON = async file => JSON.parse(await fs.readFile(file, 'utf8'));
async function maybeJSON(file) { try { return await readJSON(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
async function saveJSON(file, data) { const temp = `${file}.tmp`; await fs.writeFile(temp, JSON.stringify(data, null, 2) + '\n'); await fs.rename(temp, file); }
function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (['--help', '--dry-run', '--retry-errors'].includes(key)) out[key.slice(2)] = true;
    else if (['--split', '--corpus', '--out', '--concurrency', '--attempts'].includes(key) && argv[i + 1] && !argv[i + 1].startsWith('--')) out[key.slice(2)] = argv[++i];
    else throw new Error(`Unknown or incomplete argument: ${key}`);
  }
  return out;
}
let credentialForRedaction = '';
const options = args(process.argv.slice(2));
if (options.help) {
  console.log('Usage: node scripts/evaluate.mjs [--split development|holdout] [--corpus FILE] [--out DIR] [--concurrency 1..4] [--attempts 1..3] [--retry-errors] [--dry-run]\nSet OPENROUTER_API_KEY or OPENROUTER_KEY_FILE. Default split: development. Runs make paid requests.');
  process.exit(0);
}
async function main() {
  const split = options.split || 'development';
  if (!['development', 'holdout'].includes(split)) throw new Error('Split must be development or holdout.');
  const concurrency = Number(options.concurrency || 3), maxAttempts = Number(options.attempts || 2);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 4 || !Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error('Use concurrency 1..4 and attempts 1..3.');
  const corpus = await readJSON(path.resolve(options.corpus || path.join(ROOT, 'evaluation/corpus.json')));
  if (!Array.isArray(corpus) || !corpus.length) throw new Error('Corpus must be a nonempty array.');
  const ids = new Set();
  for (const row of corpus) {
    if (typeof row.recordId !== 'string' || !row.recordId || ids.has(row.recordId)) throw new Error('Every corpus record must have a unique nonempty recordId.');
    ids.add(row.recordId);
    if (typeof row.caseId !== 'string' || !row.caseId || typeof row.goal !== 'string' || !row.goal.trim() || !['development', 'holdout'].includes(row.split) || typeof row.video?.id !== 'string' || typeof row.video?.title !== 'string') throw new Error(`Invalid corpus record: ${row.recordId}`);
  }
  const rows = corpus.filter(r => r.split === split);
  if (!rows.length) throw new Error('No records found for this split.');
  const groups = new Map();
  for (const row of rows) {
    const request = buildRequest(row.goal, row.video), requestHash = hash(request);
    if (!groups.has(requestHash)) groups.set(requestHash, { request, requestHash, rows: [] });
    groups.get(requestHash).rows.push(row);
  }
  if (options['dry-run']) { console.log(JSON.stringify({ dryRun: true, split, records: rows.length, uniqueRequests: groups.size, rubricVersion: RUBRIC_VERSION, model: MODEL })); return; }
  let key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key && process.env.OPENROUTER_KEY_FILE) key = (await fs.readFile(process.env.OPENROUTER_KEY_FILE, 'utf8')).trim();
  if (!key || key.length > 512 || /\s/.test(key)) throw new Error('Set a valid OPENROUTER_API_KEY or OPENROUTER_KEY_FILE.');
  credentialForRedaction = key;
  if ([...groups.values()].some(g => JSON.stringify(g.request).includes(key))) throw new Error('Refusing to persist a request containing the API credential.');
  // Defensive redaction if a provider unexpectedly includes credentials in its response.
  const redact = value => {
    if (typeof value === 'string') return value.replaceAll(key, '[REDACTED]').replace(/sk-or-v\d-[A-Za-z0-9_-]+/g, '[REDACTED]');
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, /^(authorization|api[_-]?key|access[_-]?token|secret)$/i.test(k) ? '[REDACTED]' : redact(v)]));
    return value;
  };
  const output = path.resolve(options.out || path.join(ROOT, 'evaluation/runs', RUBRIC_VERSION));
  await fs.mkdir(path.join(output, 'requests'), { recursive: true });
  await fs.mkdir(path.join(output, 'records'), { recursive: true });
  const source = await fs.readFile(path.join(ROOT, 'src/jev.js'), 'utf8');
  const frozenPath = path.join(output, 'frozen-jev.js');
  try {
    const frozen = await fs.readFile(frozenPath, 'utf8');
    if (frozen !== source) throw new Error('Run directory contains a different rubric source. Bump RUBRIC_VERSION or choose a new output directory.');
  } catch (error) { if (error.code === 'ENOENT') await fs.writeFile(frozenPath, source); else throw error; }
  const manifestPath = path.join(output, `run-${split}.json`);
  const manifest = { schemaVersion: 1, split, rubricVersion: RUBRIC_VERSION, model: MODEL, rubricSourceHash: hash(source), corpusHash: hash(corpus), records: rows.length, uniqueRequests: groups.size, startedAt: new Date().toISOString(), complete: false, note: 'Metadata judgments on a fixed sample do not establish universal reliability. Error attempts may have unreported upstream charges.' };
  const previousManifest = await maybeJSON(manifestPath);
  if (previousManifest && previousManifest.corpusHash !== manifest.corpusHash) throw new Error('Corpus changed inside an existing run. Choose a new output directory.');
  await saveJSON(manifestPath, manifest);
  function call(request) {
    return new Promise(resolve => {
      const config = `url = ${JSON.stringify(ENDPOINT)}\nrequest = "POST"\nheader = ${JSON.stringify('Authorization: Bearer ' + key)}\nheader = "Content-Type: application/json"\ndata = ${JSON.stringify(JSON.stringify(request))}\n`;
      const child = spawn('curl', ['--silent', '--show-error', '--max-time', '45', '--proto', '=https', '--write-out', '\n%{http_code}', '--config', '-']);
      let stdout = '', settled = false;
      const finish = value => { if (!settled) { settled = true; resolve(value); } };
      child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 4_000_000) { child.kill(); finish({ status: 'transport_error', error: 'Response exceeded size limit.' }); } });
      child.stderr.resume();
      child.stdin.on('error', () => {});
      child.on('error', () => finish({ status: 'transport_error', error: 'curl could not be started.' }));
      child.on('close', code => {
        if (settled) return;
        if (code !== 0) return finish({ status: 'transport_error', error: 'Request transport failed or timed out.', transportExitCode: code });
        const at = stdout.lastIndexOf('\n'), httpStatus = Number(stdout.slice(at + 1));
        let response;
        try { response = redact(JSON.parse(stdout.slice(0, at))); } catch { return finish({ status: 'parse_error', error: 'Provider returned invalid JSON.', httpStatus }); }
        if (httpStatus < 200 || httpStatus >= 300) return finish({ status: 'http_error', error: `Provider returned HTTP ${httpStatus}.`, httpStatus, response });
        try { return finish({ status: 'success', httpStatus, response, decision: parseDecision(response) }); }
        catch { return finish({ status: 'parse_error', error: 'Provider returned an invalid typed decision.', httpStatus, response }); }
      });
      child.stdin.end(config);
    });
  }
  const jobs = [...groups.values()]; let next = 0, errors = 0, newlyAttempted = 0;
  async function worker() {
    while (next < jobs.length) {
      const group = jobs[next++];
      const requestPath = path.join(output, 'requests', group.requestHash + '.json');
      let saved = await maybeJSON(requestPath), wasCached = Boolean(saved);
      if (saved && (saved.requestHash !== group.requestHash || hash(saved.request) !== group.requestHash)) throw new Error('Cached request does not match its payload hash.');
      if (!saved || (saved.error && options['retry-errors'])) {
        saved = saved || { schemaVersion: 1, requestHash: group.requestHash, request: group.request, rubricVersion: RUBRIC_VERSION, attempts: [] };
        for (let i = 0; i < maxAttempts; i++) {
          const start = Date.now(), attempt = await call(group.request); newlyAttempted++;
          saved.attempts.push({ attempt: saved.attempts.length + 1, startedAt: new Date(start).toISOString(), elapsedMs: Date.now() - start, ...attempt });
          saved.decision = attempt.decision || { label: 'unclear', confidence: 0, reasonCode: 'request_error' };
          saved.error = attempt.status === 'success' ? null : attempt.error;
          // Checkpoint every attempt so malformed responses and their reported cost survive retries.
          await saveJSON(requestPath, saved);
          if (!saved.error || [400, 401, 402, 403, 404].includes(attempt.httpStatus)) break;
          if (i + 1 < maxAttempts) await new Promise(resolve => setTimeout(resolve, (i + 1) * 500));
        }
      }
      if (saved.error) errors += group.rows.length;
      for (const [i, row] of group.rows.entries()) {
        const result = { schemaVersion: 1, recordId: row.recordId, caseId: row.caseId, split, requestHash: group.requestHash, rubricVersion: RUBRIC_VERSION, model: MODEL, decision: saved.decision, error: saved.error, cached: wasCached || i > 0 };
        await saveJSON(path.join(output, 'records', hash(row.recordId) + '.json'), result);
      }
      console.log(JSON.stringify({ recordsCompleted: group.rows.length, requestHash: group.requestHash.slice(0, 12), label: saved.decision.label, error: saved.error || undefined, cached: wasCached }));
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  await saveJSON(manifestPath, { ...manifest, complete: true, completedAt: new Date().toISOString(), errors, newlyAttempted });
  console.log(JSON.stringify({ complete: true, split, records: rows.length, uniqueRequests: groups.size, errors, newlyAttempted, rubricVersion: RUBRIC_VERSION }));
  if (errors) process.exitCode = 2;
}
main().catch(error => {
  const message = String(error.message || 'Unknown error.').replaceAll(credentialForRedaction || '\0', '[REDACTED]').replace(/sk-or-v\d-[A-Za-z0-9_-]+/g, '[REDACTED]');
  console.error('Evaluation stopped: ' + message + ' Existing attempt checkpoints are retained.'); process.exitCode = 1;
});

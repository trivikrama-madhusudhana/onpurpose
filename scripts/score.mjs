#!/usr/bin/env node
/** Offline scoring. Reference labels are metadata judgments, not verified video quality. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABELS = ['direct', 'background', 'tangent', 'unclear'];
const canonical = value => JSON.stringify(value, (_key, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
const readJSON = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const ratio = (a, b) => b ? a / b : null;
const numeric = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;
function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (['--help', '--legacy-relevance-confidence', '--legacy-collapse-confidence'].includes(key)) out[key.slice(2)] = true;
    else if (['--run', '--corpus', '--labels', '--split', '--threshold', '--tangent-threshold', '--collapse-threshold', '--out'].includes(key) && argv[i + 1] && !argv[i + 1].startsWith('--')) out[key.slice(2)] = argv[++i];
    else throw new Error(`Unknown or incomplete argument: ${key}`);
  }
  return out;
}
const options = args(process.argv.slice(2));
if (options.help) { console.log('Usage: node scripts/score.mjs --run DIR [--corpus FILE] [--labels FILE] [--split development|holdout|all] [--tangent-threshold 0.8] [--collapse-threshold 0.7] [--out FILE] [--legacy-relevance-confidence|--legacy-collapse-confidence]\nOffline. Requires complete unique labels for the full corpus and complete predictions for the selected split. Default split: all.'); process.exit(0); }
async function main() {
  if (!options.run) throw new Error('--run is required.');
  const run = path.resolve(options.run), split = options.split || 'all';
  const tangentThreshold = Number(options['tangent-threshold'] ?? .8), collapseThreshold = Number(options['collapse-threshold'] ?? .7), legacyThreshold = Number(options.threshold ?? .8);
  const legacy = options['legacy-relevance-confidence'] ? 'relevance-confidence' : options['legacy-collapse-confidence'] ? 'collapse-confidence' : null;
  if (options['legacy-relevance-confidence'] && options['legacy-collapse-confidence']) throw new Error('Choose one legacy policy only.');
  if (options.threshold && !legacy) throw new Error('--threshold is only for legacy scoring. Use --tangent-threshold and --collapse-threshold for production probabilities.');
  if (!['development', 'holdout', 'all'].includes(split) || [tangentThreshold, collapseThreshold, legacyThreshold].some(n => !Number.isFinite(n) || n < 0 || n > 1)) throw new Error('Invalid split or threshold.');
  const corpus = await readJSON(path.resolve(options.corpus || path.join(ROOT, 'evaluation/corpus.json')));
  const reference = await readJSON(path.resolve(options.labels || path.join(ROOT, 'evaluation/reference-labels.json')));
  if (!Array.isArray(corpus) || !corpus.length || !Array.isArray(reference)) throw new Error('Corpus and references must be arrays.');
  function index(records, name) {
    const map = new Map();
    for (const row of records) {
      if (typeof row.recordId !== 'string' || !row.recordId || map.has(row.recordId)) throw new Error(`${name} requires unique nonempty recordId values.`);
      map.set(row.recordId, row);
    }
    return map;
  }
  const corpusById = index(corpus, 'Corpus'), refs = index(reference, 'References');
  if (refs.size !== corpusById.size || [...refs.keys()].some(id => !corpusById.has(id))) throw new Error('References must cover exactly the full corpus.');
  for (const row of corpus) {
    const ref = refs.get(row.recordId);
    if (!LABELS.includes(ref.label)) throw new Error('Reference contains an invalid class.');
    for (const field of ['video', 'caseId', 'surface', 'goal', 'query', 'split', 'capturedAt', 'sourceUrl']) {
      if (ref[field] !== undefined && canonical(ref[field]) !== canonical(row[field])) throw new Error(`Reference ${field} does not match corpus metadata for ${row.recordId}.`);
    }
  }
  let directory = path.join(run, 'records'), modern = true;
  try { await fs.access(directory); } catch { directory = run; modern = false; }
  const predictions = [];
  for (const name of await fs.readdir(directory)) {
    if (!name.endsWith('.json')) continue;
    const item = await readJSON(path.join(directory, name));
    if (item.recordId) predictions.push(item);
  }
  const predicted = index(predictions, 'Predictions');
  if ([...predicted.keys()].some(id => !corpusById.has(id))) throw new Error('Run includes predictions absent from the supplied corpus.');
  const selected = corpus.filter(r => split === 'all' || r.split === split);
  if (!selected.length) throw new Error('Selected split is empty.');
  const missing = selected.filter(r => !predicted.has(r.recordId));
  if (missing.length) throw new Error(`Missing ${missing.length} predictions in the selected split; partial runs are not scored as complete.`);
  let frozenBuild;
  try {
    const frozen = await fs.readFile(path.join(run, 'frozen-jev.js'), 'utf8');
    const module = await import('data:text/javascript;base64,' + Buffer.from(frozen).toString('base64'));
    frozenBuild = module.buildRequest;
  } catch (error) { if (modern || error.code !== 'ENOENT') throw new Error('Run has no usable frozen rubric source.'); }
  const requests = new Map(), rows = [];
  for (const row of selected) {
    const p = predicted.get(row.recordId), ref = refs.get(row.recordId), decision = p.decision;
    if (!decision || !LABELS.includes(decision.label) || !numeric(decision.confidence) || decision.confidence > 1) throw new Error(`Invalid prediction for ${row.recordId}.`);
    if (p.caseId !== undefined && p.caseId !== row.caseId || p.split !== undefined && p.split !== row.split) throw new Error('Prediction case/split does not match corpus.');
    if (p.requestHash) {
      if (!/^[a-f0-9]{64}$/.test(p.requestHash)) throw new Error('Invalid request hash.');
      if (!requests.has(p.requestHash)) requests.set(p.requestHash, await readJSON(path.join(run, 'requests', p.requestHash + '.json')));
      const request = requests.get(p.requestHash);
      if (hash(request.request) !== p.requestHash || frozenBuild && hash(frozenBuild(row.goal, row.video)) !== p.requestHash) throw new Error('Prediction payload does not match this exact goal and metadata.');
      if (canonical(request.decision) !== canonical(decision)) throw new Error('Prediction differs from checkpointed request decision.');
    } else if (modern) throw new Error('Modern prediction is missing its request hash.');
    const probability = value => numeric(value) && value <= 1 ? value : 0;
    const tangentProbability = probability(decision.tangentProbability), collapseProbability = probability(decision.collapseProbability);
    if (!legacy && !p.error && (decision.tangentProbability === undefined || decision.collapseProbability === undefined)) throw new Error('Prediction lacks production probability fields. Select an explicit legacy policy only for historical runs.');
    const legacyGateScore = legacy === 'relevance-confidence' ? decision.confidence : probability(decision.collapseConfidence);
    if (legacy === 'collapse-confidence' && !p.error && decision.collapseConfidence === undefined) throw new Error('Historical prediction lacks collapseConfidence.');
    const gate = legacy ? legacyGateScore >= legacyThreshold : tangentProbability >= tangentThreshold && collapseProbability >= collapseThreshold;
    rows.push({ ...row, reference: ref.label, rationale: ref.rationale || '', prediction: decision.label, confidence: decision.confidence, tangentProbability, collapseProbability, ...(legacy ? { legacyGateScore } : {}), collapsed: !p.error && decision.label === 'tangent' && gate, error: p.error || null });
  }
  function metrics(data) {
    const counts = Object.fromEntries(LABELS.map(label => [label, data.filter(r => r.reference === label).length]));
    const confusion = Object.fromEntries(LABELS.map(a => [a, Object.fromEntries(LABELS.map(b => [b, data.filter(r => r.reference === a && r.prediction === b).length]))]));
    const hidden = data.filter(r => r.collapsed), wrong = hidden.filter(r => r.reference !== 'tangent');
    const usefulTotal = counts.direct + counts.background, falseUseful = wrong.filter(r => ['direct', 'background'].includes(r.reference)).length;
    const removed = hidden.filter(r => r.reference === 'tangent').length;
    return {
      records: data.length, uniqueVideos: new Set(data.map(r => r.video.id)).size, referenceCounts: counts,
      collapsed: hidden.length, falseHiddenUseful: falseUseful, falseHiddenUsefulRate: ratio(falseUseful, usefulTotal),
      falseHiddenUnclear: wrong.filter(r => r.reference === 'unclear').length,
      usefulPreserved: usefulTotal - falseUseful, usefulTotal, usefulPreservationRate: ratio(usefulTotal - falseUseful, usefulTotal),
      tangentsRemoved: removed, tangentsTotal: counts.tangent, tangentRemovalRate: ratio(removed, counts.tangent),
      collapsePrecision: ratio(removed, hidden.length), fourClassAgreement: ratio(data.filter(r => r.reference === r.prediction).length, data.length),
      uncertainty: { predictedUnclear: data.filter(r => r.prediction === 'unclear').length, predictedUnclearRate: ratio(data.filter(r => r.prediction === 'unclear').length, data.length), tangentsKeptBelowThreshold: data.filter(r => r.prediction === 'tangent' && !r.collapsed).length, requestErrorsKeptVisible: data.filter(r => r.error).length },
      confusion,
      falseHidden: wrong.map(r => ({ recordId: r.recordId, title: r.video.title, reference: r.reference, prediction: r.prediction, confidence: r.confidence, tangentProbability: r.tangentProbability, collapseProbability: r.collapseProbability, ...(legacy ? { legacyGateScore: r.legacyGateScore } : {}), rationale: r.rationale })),
    };
  }
  const attempts = modern ? [...requests.values()].flatMap(r => r.attempts || []) : predictions.filter(p => selected.some(r => r.recordId === p.recordId) && !p.cached).map(p => ({ elapsedMs: p.elapsedMs, response: p.response, status: p.error ? 'error' : 'success' }));
  const usage = { uniqueRequestPayloads: modern ? requests.size : null, attempts: attempts.length, successfulAttempts: attempts.filter(a => a.status === 'success').length, failedAttempts: attempts.filter(a => a.status !== 'success').length, reportedCostUSD: 0, inputTokens: 0, outputTokens: 0, attemptsWithoutReportedCost: 0 };
  for (const attempt of attempts) {
    const u = attempt.response?.usage;
    if (numeric(u?.cost)) usage.reportedCostUSD += u.cost; else usage.attemptsWithoutReportedCost++;
    if (numeric(u?.input_tokens)) usage.inputTokens += u.input_tokens;
    if (numeric(u?.output_tokens)) usage.outputTokens += u.output_tokens;
  }
  const latencies = attempts.filter(a => numeric(a.elapsedMs)).map(a => a.elapsedMs).sort((a, b) => a - b);
  const percentile = q => latencies.length ? latencies[Math.min(latencies.length - 1, Math.ceil(q * latencies.length) - 1)] : null;
  const grouped = key => Object.fromEntries([...new Set(rows.map(r => r[key]))].map(value => [value, metrics(rows.filter(r => r[key] === value))]));
  const result = {
    schemaVersion: 1, split, policy: legacy || 'tangent-and-collapse-probabilities', thresholds: legacy ? { legacyConfidence: legacyThreshold } : { tangentProbability: tangentThreshold, collapseProbability: collapseThreshold }, scoredAt: new Date().toISOString(), completeSelectedSplit: true,
    coverage: { corpusRecords: corpus.length, referenceRecords: refs.size, selectedRecords: selected.length, selectedPredictions: rows.length },
    rubricVersions: [...new Set(selected.map(r => predicted.get(r.recordId).rubricVersion).filter(Boolean))],
    overall: metrics(rows), splits: grouped('split'), cases: grouped('caseId'), surfaces: grouped('surface'),
    usage, latency: { measuredAttempts: latencies.length, medianMs: percentile(.5), p95Ms: percentile(.95) },
    limitations: ['Jev confidence describes concentration, not the probability of the selected label. Production scoring uses explicit tangent and collapse probabilities.', 'Reference labels are independent judgments from captured metadata, not verified video contents or an accuracy benchmark for every YouTube search.', 'Holdout independence is lost if its outcomes are used to tune the rubric; use new held-out cases for subsequent tuning.', 'Costs sum reported usage once per shared request and include checkpointed failed attempts when usage is present. Missing usage and legacy retry history may hide upstream charges.', 'Per-split request costs can overlap when the same payload occurs in both splits; use the all-split report for the deduplicated total.'],
  };
  await fs.writeFile(path.resolve(options.out || path.join(run, `metrics-${split}.json`)), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ split, complete: true, overall: result.overall, usage, latency: result.latency }, null, 2));
}
main().catch(error => { console.error('Scoring failed: ' + error.message); process.exitCode = 1; });

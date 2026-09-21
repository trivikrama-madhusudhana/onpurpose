#!/usr/bin/env node
/** Fresh, signed-out YouTube metadata capture. Frozen evaluation fixtures are never overwritten by default. */
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (['--help', '--headful'].includes(key)) out[key.slice(2)] = true;
    else if (['--cases', '--out', '--split', '--concurrency', '--search-limit', '--shorts-limit', '--watch-limit'].includes(key) && argv[i + 1] && !argv[i + 1].startsWith('--')) out[key.slice(2)] = argv[++i];
    else throw new Error(`Unknown or incomplete argument: ${key}`);
  }
  return out;
}
const options = args(process.argv.slice(2));
if (options.help) { console.log('Usage: node scripts/collect.mjs [--cases FILE] [--out DIR] [--split development|holdout|all] [--headful] [--concurrency 1..2] [--search-limit 12] [--shorts-limit 4] [--watch-limit 10]\nRequires npm install and npx playwright install chromium. Default output: evaluation/local-capture. Fresh signed-out browser; no user browser cookies or account changes.'); process.exit(0); }
const readJSON = async file => JSON.parse(await fs.readFile(file, 'utf8'));
async function saveJSON(file, data) { const temp = `${file}.tmp`; await fs.writeFile(temp, JSON.stringify(data, null, 2) + '\n'); await fs.rename(temp, file); }
async function main() {
  const split = options.split || 'all';
  if (!['development', 'holdout', 'all'].includes(split)) throw new Error('Invalid split.');
  const concurrency = Number(options.concurrency || 2);
  const searchLimit = Number(options['search-limit'] ?? 12), shortsLimit = Number(options['shorts-limit'] ?? 4), watchLimit = Number(options['watch-limit'] ?? 10);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 2 || [searchLimit, shortsLimit, watchLimit].some(n => !Number.isInteger(n) || n < 0 || n > 40) || searchLimit + shortsLimit === 0) throw new Error('Use concurrency 1..2 and per-surface limits 0..40, with at least one search result.');
  const allCases = await readJSON(path.resolve(options.cases || path.join(ROOT, 'evaluation/cases.json')));
  if (!Array.isArray(allCases) || !allCases.length) throw new Error('Cases must be a nonempty array.');
  const ids = new Set();
  for (const c of allCases) {
    if (typeof c.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(c.id) || ids.has(c.id) || typeof c.goal !== 'string' || !c.goal.trim() || typeof c.query !== 'string' || !c.query.trim() || !['development', 'holdout'].includes(c.split)) throw new Error('Cases need unique safe IDs, goals, queries, and development/holdout splits.');
    ids.add(c.id);
  }
  const cases = allCases.filter(c => split === 'all' || c.split === split);
  if (!cases.length) throw new Error('No cases selected.');
  const output = path.resolve(options.out || path.join(ROOT, 'evaluation/local-capture'));
  if (output === path.join(ROOT, 'evaluation')) throw new Error('Choose a capture subdirectory; do not overwrite frozen evaluation fixtures.');
  await fs.mkdir(path.join(output, 'pages'), { recursive: true });
  const helperCode = await fs.readFile(path.join(ROOT, 'src/dom.js'), 'utf8');
  const extractorHash = createHash('sha256').update(helperCode).digest('hex');
  const captureConfig = { searchLimit, shortsLimit, watchLimit, extractorHash };
  const errors = [], pages = new Map();
  // Refuse to combine old cached captures with changed goals, metadata extraction or limits.
  for (const c of cases) {
    try {
      const cached = await readJSON(path.join(output, 'pages', c.id + '.json'));
      if (cached.meta.goal !== c.goal || cached.meta.query !== c.query || cached.meta.split !== c.split || JSON.stringify(cached.config) !== JSON.stringify(captureConfig)) throw new Error(`Capture changed for ${c.id}; choose a fresh --out directory.`);
      if (!cached.errors?.length && cached.rows?.length) pages.set(c.id, cached);
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await saveJSON(path.join(output, 'cases.json'), cases);
  const browser = await chromium.launch({ headless: !options.headful, args: ['--autoplay-policy=user-gesture-required'] });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'en-US' });
    await context.route('**/*', route => route.request().resourceType() === 'media' || /(^|\.)googlevideo\.com$/.test(new URL(route.request().url()).hostname) ? route.abort() : route.continue());
    await context.addInitScript(() => {
      HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
      document.addEventListener('play', event => { if (event.target instanceof HTMLMediaElement) event.target.pause(); }, true);
    });
    async function extract(page) {
      return page.evaluate(code => {
        // Identical extractor file to the extension, not a separate scraping heuristic.
        new Function(code)();
        const results = globalThis.OnPurposeDOM.extractVideos(document);
        if (results.some(v => /^[\d:\s]+(?:Now playing)?$/.test(v.title))) throw new Error('Duration was extracted instead of a title.');
        return results.map((video, i) => ({ ...video, format: document.querySelector(`a[href^="/shorts/${video.id}"]`) ? 'short' : 'video', sourcePosition: i + 1 }));
      }, helperCode);
    }
    let next = 0;
    async function worker() {
      const page = await context.newPage();
      try {
        while (next < cases.length) {
          const c = cases[next++];
          if (pages.has(c.id)) { console.log(JSON.stringify({ caseId: c.id, cached: true })); continue; }
          const meta = { caseId: c.id, goal: c.goal, query: c.query, split: c.split, capturedAt: new Date().toISOString(), signedIn: false };
          const rows = [], snapshots = [], caseErrors = [];
          function addRows(surface, sourceUrl, videos) {
            for (const video of videos) rows.push({ ...meta, surface, sourceUrl, capturedAt: new Date().toISOString(), position: video.sourcePosition, video, recordId: `${c.id}:${surface === 'search' ? 'search' : 'watch'}:${video.id}` });
          }
          let search = [];
          try {
            const sourceUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(c.query);
            await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await page.waitForSelector('ytd-video-renderer,yt-lockup-view-model', { timeout: 25000 });
            await page.mouse.wheel(0, 1500); await page.waitForTimeout(1000);
            const available = await extract(page);
            snapshots.push({ surface: 'search', sourceUrl: page.url(), capturedAt: new Date().toISOString(), supportedCards: available });
            meta.searchSupportedCards = available.length;
            search = [...available.filter(v => v.format !== 'short').slice(0, searchLimit), ...available.filter(v => v.format === 'short').slice(0, shortsLimit)].sort((a, b) => a.sourcePosition - b.sourcePosition);
            if (!search.length) throw new Error('No supported search cards found; consent, access or renderer changes may be blocking collection.');
            addRows('search', page.url(), search);
          } catch (error) { caseErrors.push({ caseId: c.id, surface: 'search', error: String(error.message).slice(0, 300) }); }
          if (search.length && watchLimit) {
            try {
              await page.goto(search[0].url, { waitUntil: 'domcontentloaded', timeout: 45000 });
              await page.waitForSelector('ytd-compact-video-renderer,yt-lockup-view-model', { timeout: 20000 });
              await page.waitForTimeout(1000);
              const available = (await extract(page)).filter(v => v.id !== search[0].id);
              snapshots.push({ surface: 'watch-recommendation', sourceUrl: page.url(), capturedAt: new Date().toISOString(), supportedCards: available });
              if (!available.length) throw new Error('No supported watch-page recommendations found.');
              addRows('watch-recommendation', page.url(), available.slice(0, watchLimit));
            } catch (error) { caseErrors.push({ caseId: c.id, surface: 'watch-recommendation', error: String(error.message).slice(0, 300) }); }
          }
          const occurrences = new Map();
          for (const row of rows) { const n = (occurrences.get(row.recordId) || 0) + 1; occurrences.set(row.recordId, n); if (n > 1) row.recordId += `:occ${n}`; }
          const capture = { schemaVersion: 1, meta, config: captureConfig, snapshots, rows, errors: caseErrors };
          await saveJSON(path.join(output, 'pages', c.id + '.json'), capture);
          pages.set(c.id, capture); errors.push(...caseErrors);
          console.log(JSON.stringify({ caseId: c.id, search: rows.filter(r => r.surface === 'search').length, recommendations: rows.filter(r => r.surface === 'watch-recommendation').length, errors: caseErrors.length }));
        }
      } finally { await page.close(); }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
  } finally { await browser.close(); }
  const corpus = cases.flatMap(c => pages.get(c.id)?.rows || []);
  if (new Set(corpus.map(r => r.recordId)).size !== corpus.length) throw new Error('Capture produced duplicate record IDs.');
  await saveJSON(path.join(output, 'corpus.json'), corpus);
  await saveJSON(path.join(output, 'collection-errors.json'), errors);
  await saveJSON(path.join(output, 'capture-summary.json'), { complete: errors.length === 0, requestedCases: cases.length, capturedCases: new Set(corpus.map(r => r.caseId)).size, records: corpus.length, config: captureConfig, capturedAt: new Date().toISOString(), note: 'Signed-out results change over time. Assign new independent references before scoring fresh captures; frozen references must not be reused against changed metadata.' });
  console.log(JSON.stringify({ complete: errors.length === 0, cases: new Set(corpus.map(r => r.caseId)).size, records: corpus.length, errors: errors.length }));
  if (errors.length) process.exitCode = 2;
}
main().catch(error => { console.error('Collection stopped: ' + error.message); process.exitCode = 1; });

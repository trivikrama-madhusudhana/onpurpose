# Reproducing the evaluation

These scripts use the extension's own DOM extractor and Jev request/parser. They do not install an extension, publish a repository, or create reference labels automatically.

Run commands from the repository root after `npm ci`. Node 22+, `curl`, and Playwright Chromium are required for live work. Offline scoring does not need a key or browser.

## 1. Inspect the frozen sample without paying for requests

```sh
node scripts/evaluate.mjs --dry-run --split development
node scripts/score.mjs --run evaluation/frozen-run --split all
```

The scorer reads `evaluation/corpus.json` and `evaluation/reference-labels.json` by default. It requires unique record IDs, complete references for the full corpus, exact matching reference metadata wherever supplied, and predictions for every record in the selected split. Choose `--split all` only after both splits are complete. Each result reports per-goal and per-surface confusion, useful videos incorrectly hidden, unclear videos incorrectly hidden, tangent removal, uncertainty, latency and reported cost.

Current filtering requires a `tangent` label, `tangentProbability >= 0.8`, and `collapseProbability >= 0.7`. These are explicit probabilities from the two typed questions. Jev confidence describes concentration and is not the probability of the chosen label. Missing probability fields fail open in the extension; the scorer rejects historical schemas unless an explicit legacy flag is supplied. Historical v1 runs use `--legacy-relevance-confidence`; v2/v3 runs use `--legacy-collapse-confidence`. These flags evaluate old policies and must not describe the current extension. Legacy `--threshold` defaults to 0.8. Production overrides are `--tangent-threshold` and `--collapse-threshold`, and must be reported when changed.

## 2. Run live Jev evaluation

Point to an existing key file; do not commit credentials. Alternatively, supply `OPENROUTER_API_KEY` through your preferred secret manager.

```sh
export OPENROUTER_KEY_FILE=/path/to/your/existing-key-file
node scripts/evaluate.mjs --split development
node scripts/score.mjs --run evaluation/runs/onpurpose-relevance-v4 --split development
```

**Live evaluation makes paid requests.** It sends each goal and its video metadata to OpenRouter and the Jev provider. Default concurrency is 3; each failed request can receive one retry. Options include `--concurrency 1`, `--attempts 1`, `--corpus FILE`, and `--out DIR`.

The default output is `evaluation/runs/<RUBRIC_VERSION>/`. `frozen-jev.js` records the exact rubric source. `requests/` stores full request payloads, redacted responses, every attempt and usage; `records/` maps corpus rows to their requests. Credentials travel to curl through stdin, never command-line arguments or saved headers. Duplicate full payloads share a request checkpoint; cost is counted once per request attempt, not once per repeated corpus row. A transport failure can have unreported upstream charges, so these totals are not an account-balance reconciliation.

A repeated command resumes saved requests without spending again. Failed checkpoints also remain cached unless you pass `--retry-errors`. Retries append attempts so their reported costs remain visible. A changed rubric or changed corpus requires a new run directory; bump `RUBRIC_VERSION` when tuning the rubric. Do not run two writers against the same output directory simultaneously.

After development decisions are settled, evaluate the held-out split once:

```sh
node scripts/evaluate.mjs --split holdout
node scripts/score.mjs --run evaluation/runs/onpurpose-relevance-v4 --split all
```

If you tune from holdout outcomes, it is no longer held out. Collect and independently label new cases for a new evaluation. Confidence scores and a small fixed sample do not establish universal reliability.

## 3. Capture fresh YouTube pages

```sh
npx playwright install chromium
node scripts/collect.mjs
```

Default output is `evaluation/local-capture/`, leaving the frozen corpus and reference labels untouched. The collector uses a fresh, signed-out browser and the exact `src/dom.js` extraction code. It records search results plus recommendations from the first selected result, with goals, queries, source URLs, timestamps, positions, visible metadata and extraction coverage. Browser media requests are blocked; it does not watch videos, inspect transcripts, use account cookies or change account settings.

Use `--headful` to see the collection browser, `--split development` to limit cases, or `--out evaluation/local-capture-2` for a separate snapshot. Search and watch limits are adjustable with `--search-limit`, `--shorts-limit`, and `--watch-limit`. Cached pages resume only when case details, extractor and collection limits match. Failed surfaces are recorded and cause a nonzero exit status; preserve those coverage limitations.

Fresh pages need fresh independent labels. Never apply frozen labels to changed titles, descriptions, channels or goals:

```sh
node scripts/evaluate.mjs --corpus evaluation/local-capture/corpus.json --out evaluation/runs/fresh-sample --split development
node scripts/score.mjs --run evaluation/runs/fresh-sample --corpus evaluation/local-capture/corpus.json --labels evaluation/local-capture/reference-labels.json --split development
```

A reference entry must contain `recordId`, `label` (`direct`, `background`, `tangent`, `unclear`) and preferably `rationale`, `caseId`, `surface`, and an exact copy of `video`. Record who labeled it, which metadata was visible, and whether predictions had been seen. The scripts validate consistency; they cannot establish that annotators were independent or correct.

## Exit statuses

- `0`: selected work completed; inspect metrics rather than treating success as a relevance-quality guarantee.
- `1`: invalid inputs, incomplete predictions, changed fixtures, or a fatal execution error.
- `2`: live collection or inference finished with recorded errors. Inference errors fail open as visible `unclear` records and count separately in scoring.

The scorer can also read historical flat prediction directories containing one JSON file per record. Their original retry history may be incomplete; the report calls out this cost limitation.

## Exercise the real extension

```sh
export OPENROUTER_KEY_FILE=/path/to/your/existing-key-file
npm run test:browser
```

This live test loads the unpacked extension in a fresh Chromium profile and uses real YouTube pages and paid Jev calls. It checks missing-key behavior, YouTube-only injection, saving a key, goal setting, collapsing obvious unrelated results, reveal controls, saving, pause, goal changes, YouTube navigation and playback bookmarks. The temporary browser profile is removed after the run; screenshots and a result log go to ignored `evaluation/local-browser/`. Screenshots are taken only after the API-key input is cleared. It does not use your personal browser profile.

When editing an already loaded unpacked extension manually, reload it in `chrome://extensions` and reload YouTube tabs before testing.

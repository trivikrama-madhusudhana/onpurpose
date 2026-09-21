# Contributing

Use Node.js 22 or later, run `npm ci`, then `npm test`. The default tests use mocked browser and network dependencies, so they do not need an API key and do not incur charges. Load the repository folder as an unpacked extension for manual testing.

## Source layout

| Path | Responsibility |
|---|---|
| `manifest.json` | YouTube-only content matching and extension entry points |
| `src/background.js` | Trusted messages, API key storage, queue, caching and usage |
| `src/jev.js` | Typed questions and response parsing shared with evaluation |
| `src/dom.js` | Supported YouTube card and metadata extraction |
| `src/content.js` | Goal controls, relevance labels, reversible hiding and saved actions |
| `src/popup.*` | Toolbar controls and first-use routing |
| `src/options.*` | Key management and reported usage |
| `src/saved.*` | Local saved-video list |
| `tests/` | Offline functional and security regression tests |
| `evaluation/` | Frozen relevance sample, references, decisions and historical verification |

## Changes worth checking carefully

Keep credentials in trusted extension contexts. Never send the key to content scripts or put remote executable code in the extension. Preserve the restriction to desktop YouTube.

YouTube reuses cards and navigation does not always reload the document. Test changed goals, late API responses, scrolling, duplicates, pause and reveal. Uncertain decisions and errors must leave videos visible. The displayed outside-goal label must agree with the hide decision.

A model or rubric change needs fresh evaluation. Do not reuse a held-out sample as independent evidence after tuning against it. The existing reference labels were made by an assistant from metadata, not verified by watching every video.

Run the complete offline suite before proposing a change. For browser changes, also check real YouTube in light and dark modes and at different desktop widths. State which version was actually tested. Optional browser/evaluation scripts are documented in `scripts/README.md`; live runs use paid OpenRouter requests.

Never commit API keys, browser profiles, private screenshots or personal automation files. Bug reports and pull requests should include the observed problem, resulting behaviour and checks performed.

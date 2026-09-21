# Idea Flow: relevance evaluation results

**The frozen prototype preserved every reference-useful and uncertain card in this sample while collapsing 70 of 99 tangents. It did not meet every predeclared acceptance target.** Development distraction removal was 68.6%, below the 70% target; held-out distraction removal was 72.9%, above it. This supports a conservative prototype, not a claim that Jev always returns the right answer or that all 15 searches are equally well validated.

## What was evaluated

On 21 September 2026, the collector captured real, signed-out YouTube pages for 15 concrete problem-solving goals: 10 development and five predetermined holdout goals. The final sample contains **381 displayed cards representing 353 distinct videos**: 231 search cards, including 60 Shorts, and 150 watch-page recommendations. Some videos appear on multiple surfaces or as separate card occurrences; the figures below count cards, not independent videos.

The collector used the extension's shared DOM extraction module. The final corpus includes 169 description snippets; 212 cards have no captured description. Titles and available channels/snippets are the evidence. Videos were not watched, transcripts were not inspected, and linked tutorials were not tested. Earlier invalid extraction attempts are excluded from these quality results.

A separate assistant annotated all final metadata without viewing Jev predictions. These **independent assistant judgments are not human labels or verified ground truth**. References comprise 146 direct results, 71 useful prerequisites/background results, 99 tangents and 65 unclear cards. Each reference includes its rationale and copied metadata. The exact corpus hash is recorded in `holdout-freeze.json` and the protocol.

## Frozen filtering policy

The final adapter version is `idea-flow-relevance-v4`, using OpenRouter's Jev typed decisions endpoint and resolved model `typesafe/jev-1.13-20260917`. Two typed questions assess relevance and whether collapsing the card is appropriate. A card is collapsed only when all three conditions hold:

- Its selected relevance label is `tangent`.
- The explicit probability assigned to `tangent` is at least 0.8.
- The explicit probability assigned to `collapse` is at least 0.7.

These probabilities are model outputs, not calibrated reliability guarantees. Jev's separate `confidence` field is not the probability of the selected answer. Cards failing any condition remain visible. The protocol's original single-confidence shorthand is superseded by these frozen, explicit probability conditions.

The policy was frozen at 13:02:04 UTC on 21 September, before the five held-out goals were queried. The freeze explicitly records the development shortfall. Development responses originally obtained under v2 were reparsed through the final v4 probability policy; the 130 holdout cards received fresh v4 requests. Thus, the final dataset combines cached development responses and fresh holdout responses rather than a newly repeated 381-request run.

## Results against the references

| Measure | Development | Holdout | Overall |
|---|---:|---:|---:|
| Cards | 251 | 130 | 381 |
| Useful cards retained | 162/162 | 55/55 | **217/217** |
| Unclear cards retained | 38/38 | 27/27 | **65/65** |
| Useful cards incorrectly hidden | 0 | 0 | **0** |
| Unclear cards incorrectly hidden | 0 | 0 | **0** |
| Tangents collapsed | 35/51 | 35/48 | **70/99** |
| Tangent removal | **68.6%** | **72.9%** | **70.7%** |
| Agreement across all four labels | 73.7% | 73.1% | **73.49%** |

All 70 collapsed cards were reference tangents: 100% observed collapse precision. This is a small-sample observation, not a guarantee about future pages. Twenty-nine reference tangents remained visible.

The four-class agreement matters because preserving a card does not prove Jev understood it correctly. For example, 26 reference-unclear cards were labelled direct. Seven reference-background cards and nine unclear cards were labelled tangent, but did not satisfy the complete collapse policy and therefore remained visible. The conservative action gate prevented those classification disagreements from hiding them.

Search results lost 25 of 36 tangents (69.4%); watch recommendations lost 45 of 63 tangents (71.4%). Both surfaces preserved all reference-useful and unclear cards.

## Every goal

“Useful” combines direct and background reference labels. “Unclear kept” refers to reference uncertainty, regardless of the label Jev assigned. Fractions show observed counts rather than implying large-sample reliability.

| Goal | Split | Cards | Useful kept | Tangents collapsed | Unclear kept |
|---|---|---:|---:|---:|---:|
| Next.js hydration mismatch | development | 25 | 17/17 | 2/5 | 3/3 |
| Excel XLOOKUP across sheets | development | 25 | 16/16 | 4/7 | 2/2 |
| Resolve variable-frame-rate audio drift | holdout | 26 | 12/12 | 7/12 | 2/2 |
| OBS microphone without desktop audio | development | 26 | 6/6 | 8/13 | 7/7 |
| iPhone → Windows photos over USB | development | 23 | 2/2 | 6/6 | 15/15 |
| Dense/gummy sourdough | development | 26 | 23/23 | 0/2 | 1/1 |
| Running toilet / flapper replacement | holdout | 26 | 19/19 | 3/5 | 2/2 |
| Rear-derailleur indexing | development | 26 | 21/21 | 4/4 | 1/1 |
| Figma responsive icon/text button | development | 26 | 21/21 | 3/4 | 1/1 |
| Pandas merge row multiplication | holdout | 26 | 9/9 | 11/12 | 5/5 |
| Buzzing barre chords | development | 22 | 19/19 | 1/1 | 2/2 |
| Lightroom green skin cast | holdout | 26 | 10/10 | 8/12 | 4/4 |
| Bambu A1 PLA first-layer adhesion | development | 26 | 22/22 | 1/1 | 3/3 |
| Elementor mobile horizontal overflow | development | 26 | 15/15 | 6/8 | 3/3 |
| Sheets dependent dropdowns without script | holdout | 26 | 5/5 | 6/7 | 14/14 |

The zero-observed false-hiding gate passed on all 15 goals. The aggregate 70% distraction-removal gate **failed on development and passed on holdout**. The combined 70.7% result does not erase the development failure. Several individual goals had much lower removal, including Next.js (2/5) and Resolve (7/12).

Sourdough, guitar and Bambu contained fewer than three reference tangents each, below the protocol's minimum for meaningful per-goal distraction-removal evidence. Sourdough removed none of its two tangents. Guitar and Bambu removed their single tangents, which is insufficient to establish robust performance for those topics.

## What the sample does not settle

- **OBS search coverage:** No captured result explicitly demonstrated microphone-only recording. Six cards taught useful source/track-routing background. Preserving those six is not proof that the search found a solution.
- **Pandas coverage:** Only one card explicitly discussed row multiplication caused by merge. Generic duplicate deletion may mask the underlying join error, so several such cards remain reference-unclear.
- **Constraint ambiguity:** Many iPhone results did not establish USB rather than wireless/cloud transfer. Many Sheets results did not establish a no-script implementation. They remain visible, but “direct” badges should not be read as verification of those constraints.
- **Metadata limits:** A promising title can hide a poor tutorial; a vague title can hide an excellent one. This evaluation measures apparent task relevance from available metadata, not answer correctness or actual problem resolution.
- **Sampling limits:** These are signed-out snapshots, not the user's personalised homepage or a longitudinal distraction study. The 28 repeated video appearances also reduce independence relative to the 381 card count.
- **Annotation limits:** The references come from one independent assistant, not multiple human reviewers. Borderline prerequisite-versus-tangent judgments are contestable; the saved rationales make them reviewable.

## Cost and latency

The underlying successful responses corresponding to one classification of all 381 cards report **$0.014617932** in Jev inference cost; about 1.46 US cents. That combines the original development responses with the fresh holdout responses; it excludes earlier extraction attempts, development iterations, retries without reported usage and separate live checks.

The portable scorer reports **$0.004985652** as new spend for the final cached/reparsed run because only the 130 holdout requests were fresh. The two amounts answer different questions: the first is the reported cost represented by a complete sample pass; the second is additional spend in that final run. Neither is an account-balance reconciliation.

Saved request round-trip latency was **429 ms median and approximately 550 ms p95**. These are inference-request measurements, not time until an entire YouTube page is filtered; browser extraction, queueing, concurrency, rendering and cache hits affect the visible experience.

## Reproduce or extend the evaluation

The repository includes the final corpus, reference annotations, raw frozen responses, policy freeze and machine-readable metrics. From the repository root, recompute the frozen result without an API key or new paid requests:

```sh
node scripts/score.mjs --run evaluation/frozen-run --split all
```

`collect.mjs` captures new YouTube metadata using the production extractor; `evaluate.mjs` submits bounded Jev requests and checkpoints responses; `score.mjs` validates record/reference consistency and reports per-goal and per-surface metrics. See `scripts/README.md` for prerequisites, live-request costs, resumability and fresh-sample commands. New metadata requires new independent labels. Tuning from these holdout outcomes would consume the holdout; a new independent assessment would need fresh cases.

This report covers relevance quality only. Extension security and live functional behaviour are separate checks and are not established by these classifier metrics.

## Separate functional verification

After freezing the relevance policy, the final extension passed **36 automated tests and 13 live browser checks**. The live run used a fresh signed-out Chromium profile, the actual unpacked extension and actual Jev requests. It checked YouTube-only injection, missing-key behavior, BYOK input clearing, unrelated-card collapse, individual/all reveal, save for later, pause, changing the goal, YouTube navigation, saving a playback position and absence of page script errors. It reported 38 requests costing $0.001434636.

The browser loop exposed two UI timing bugs: submitting an unchanged goal while classification was pending could leave filtering stuck, and a late state response could overwrite a draft goal. Both were fixed, regression tests added, and the full live flow passed afterward. These changes did not alter the frozen Jev prompt or probability policy. Evidence is in `live-extension-results.json` and `verification.json`; the reusable script is `scripts/test-browser.mjs`. These checks cover the earlier prototype version. A Chrome Web Store listing is not available.

## Later usability update

Version 0.1.2 changes the interface, not the frozen Jev model policy. It removes minimize and the combined finish action, separates saving from pausing, adds a dedicated Saved videos page, and follows YouTube's actual theme and content inset. The updated unit suite passes 60 tests. Wide and narrow desktop fixtures were checked in light and dark mode, including expanded relevance help. Final verification on the user's live YouTube page requires reloading the extension. See `ux-checks-0.1.2.json`; earlier live checks above describe their earlier versions.

## Public release 0.1.4

The current automated suite passes 62 tests. These include consistent outside-goal labels, individual reveal, show/hide all and newly loaded cards. Historical live checks above cover their recorded source versions, not a fresh end-to-end run of 0.1.4. The latest visual and control changes still need current live-browser confirmation. Filtering thresholds and the frozen model rubric are unchanged.

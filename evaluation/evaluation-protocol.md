# YouTube relevance evaluation

## What this evaluation can establish

Assess whether Jev makes useful, conservative relevance decisions on visible YouTube metadata for 15 concrete tasks. Labels describe apparent relevance, not the correctness or completeness of the video. The reference annotations are independent assistant judgments, not ground truth from watching videos or a human usability study. Confidence scores are not calibrated probability estimates.

The 15 case IDs and their 10 development / 5 holdout assignments are fixed in `cases.json` before collection or model assessment. Holdout goals span video editing, home repair, data analysis, photo editing and spreadsheets. Root may adapt search wording to obtain actual results, preserving the goal, case ID, original query and executed query.

## Collection and annotation

Capture actual YouTube search cards and, where possible, watch-page recommendation cards. Retain case ID, page URL, executed query, timestamp, source surface, video ID, title, channel, description/snippet and video URL. Preserve missing metadata as missing; do not infer a video's contents from an external source. Record unsupported cards, unavailable pages and collection failures rather than replacing them with invented examples.

Reference annotation reads the goal and collected metadata only. The annotator must not view Jev outputs before labels are saved. Label each record with one of:

- `direct`: The metadata explicitly addresses the problem, required operation or constraint. A broader tutorial is direct only if the relevant operation is evident.
- `background`: An identifiable prerequisite or diagnostic concept likely needed to complete this particular task. Sharing a general topic is insufficient.
- `tangent`: The metadata clearly concerns a different task, entertainment or a method violating an explicit user constraint. A related but unneeded topic is still a tangent.
- `unclear`: Too little information or conflicting signals to distinguish the preceding labels responsibly. Vague titles alone are not proof of irrelevance.

Each label includes a concise rationale, the metadata fields considered, annotator identity and the evidence limitation. Distinguish record-level results from unique-video results; repeated cards should not silently inflate coverage. Analyse search and watch recommendation surfaces separately, since a precise search query may offer few distractors.

## Iteration without leaking the holdout

1. Save the raw corpus and independently annotated reference labels.
2. Run an initial rubric on development goals only. Inspect every false-hidden useful card, unclear card hidden and missed direct result. Diagnose the task relationship before changing the prompt or threshold.
3. Freeze the rubric, parser, model alias/resolved model and collapse threshold. Save a versioned request definition.
4. Evaluate the five holdout goals once with the frozen configuration. Any subsequent tuning based on their failures makes them development data; report this explicitly and obtain fresh holdout cases before claiming a new independent pass.
5. Report both initial and final development results and the untouched holdout results. Never claim that 15 successful metadata searches establish universal reliability.

## Metrics and provisional acceptance gate

The production policy initially collapses only a `tangent` decision with confidence >= 0.8. All other outcomes and request failures preserve the card.

Required per goal, per surface and in aggregate:

- Count of reference direct/background/tangent/unclear records and unique videos.
- Full four-class confusion matrix and descriptive agreement rate.
- **False-hidden useful:** reference direct/background cards actually collapsed. The acceptance gate is zero observed on every evaluated goal. Show count and denominator, not only a percentage.
- **Direct preservation:** reference direct cards left visible. Gate: 100% observed per goal. Correctly labelling all direct results as direct is reported separately; leaving background or unclear visible can be an acceptable conservative choice.
- **Unclear preservation:** reference unclear cards left visible. Gate: 100% observed; insufficient metadata must not create confident suppression.
- **Distraction removal:** reference tangents actually collapsed / all reference tangents. Target >= 70% aggregate on both development and holdout when there are at least 10 reference tangents in that split. Report per-goal rates; if a goal has fewer than 3 tangents, mark its distraction-removal evidence insufficient. Zero tangents is not a pass for distraction removal.
- Collapse precision: reference tangents among all collapsed cards. Gate: no observed useful or unclear card collapsed; enumerate other disagreements.
- Visible metadata coverage: how many cards were captured and classified versus present/supported. Preserve failed or unavailable cases in the report. All 15 goals need actual captured results to complete the requested search evaluation.
- API success/parse-error rate, request count, input tokens, actual reported cost, median/p95 end-to-end latency and cache behaviour. Preserve the model returned in every response.

These thresholds are conservative engineering gates, not a statistical safety guarantee. If a sample has no meaningful tangents or too few useful results, describe the lack of evidence and supplement collection rather than presenting agreement as effectiveness. Confidence intervals can be useful alongside observed counts but do not remove sampling bias.

## Functional acceptance is separate

Root's extension tests must additionally establish YouTube-only injection, no key exposure in content/page scripts, bounded API concurrency, missing-key/error fail-open behaviour, pause and reveal, goal-change stale-response protection, SPA navigation and reversible card restoration. Relevance evaluation does not prove these behaviours. No publishing or demo-video preparation until the result and remaining limitations have been reviewed.

## Final reference annotation provenance

`reference-labels.json` version `final-metadata-v1` independently annotates 381 canonical records from the final corpus (353 distinct video IDs). Corpus SHA-256: `0ce72a9244394453f8b298fb72cf19fa7ae52451115b161de70b25133477b791`. All metadata was reviewed before any Jev prediction was viewed; the annotator did not inspect prediction files. Earlier title-only labels were reused only after reviewing the final title/snippet and were revised where the added evidence changed the judgment. The alternate Figma card is separately annotated as `figma-button:search:PNJxeD29ZTg:occ2`.

Reference counts are 146 direct, 71 background, 99 tangent and 65 unclear. Development contains 110 direct / 52 background / 51 tangent / 38 unclear; holdout contains 36 direct / 19 background / 48 tangent / 27 unclear. These are reference judgments, not model performance results.

169 records include page-description snippets; 212 have no captured description. Watch recommendations and Shorts therefore rely mainly on titles. Do not infer that a missing description means the actual video lacks information. Broad tutorials are retained as unclear where the specific relevant mechanism cannot be identified. Explicitly taught prerequisites (for example XLOOKUP mechanics or Figma auto layout) are background. A different software application or an expressly opposite operation is a tangent.

Important boundary judgments and coverage gaps:

- OBS has six useful background records but no clearly direct microphone-only recording result. Source/track separation helps, but does not establish exclusion of desktop audio. Record this as a search-coverage limitation rather than claiming a complete task solution.
- Pandas has one explicit direct result describing row duplication caused by merge. Generic deduplication remedies are unclear because they can mask incorrect join cardinality. Join fundamentals are background.
- iPhone transfer has two direct USB cards and 15 unclear cards. Correct devices and direction alone do not establish that an unspecified method uses a cable rather than cloud/wireless transfer.
- Google Sheets has three explicitly no-code dependent-dropdown results and 14 unclear records. The dependent-dropdown operation can be implemented with or without Apps Script, so unstated methods remain uncertain. Explicit Apps Script and Excel-only methods are tangents.
- The Resolve snippet for automatic sync failure and the external-recorder drift tutorial were downgraded to background: a shared symptom does not establish the specified VFR cause. The VFR-to-CFR remedy remains useful despite a Premiere-oriented snippet because frame conversion explicitly addresses the supplied cause.
- Sourdough, guitar and Bambu cases contain only one or two reference tangents. Their distraction-removal evidence is insufficient under the predeclared per-goal minimum, even if all captured tangents are collapsed correctly.
- General beginner courses, unspecified tricks and vaguely titled cards must not be labelled irrelevant merely because metadata is incomplete. Conversely, same-topic entertainment is not automatically a useful prerequisite.

No causal accuracy, video quality, actual problem resolution or behaviour on the user's signed-in personalised feed is established by this metadata snapshot. A zero-observed false-hide result would remain a finite-sample result requiring live user testing.

# Changelog

## 0.1.5 (2026-09-21)

Fix relevance labels on modern YouTube watch-page recommendations. Labels now sit beneath the title inside the text column instead of becoming a cramped extra column. A regression test reproduces the observed layout. All 63 offline tests pass.

## 0.1.4 (2026-09-21)

Initial public release. Filters desktop YouTube cards against a fixed goal using Jev through a user-provided OpenRouter key. Includes colour-coded relevance labels, reversible hiding, show/hide all controls, separate settings and saved videos, and playback bookmarks.

The release passes 62 offline tests. The repository includes the frozen 15-goal relevance evaluation and explicitly versioned historical live checks. Current interface changes still need a fresh full live-browser check. No Chrome Web Store listing is available.

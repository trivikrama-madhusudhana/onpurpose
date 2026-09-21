# Changelog

## 0.2.2 (2026-09-21)

Restore hiding and relevance labels if YouTube redraws a card and removes the extension decoration. Individual reveal and show/hide-all choices are preserved, without new API requests. All 65 automated tests pass.

## 0.2.1 (2026-09-21)

Keep the goal bar in page flow when YouTube loads its page container after the extension. This prevents the bar from covering the top of the player or recommendations on a fresh watch-page load. All 64 automated tests pass.

## 0.2.0 (2026-09-21)

Adopt the OnPurpose name across the extension, documentation, downloads and repository. Existing keys, goals, bookmarks and usage totals remain in Chrome storage when updating the existing installation. Includes the modern watch-page label layout fix.

## 0.1.5 (2026-09-21)

Fix relevance labels on modern YouTube watch-page recommendations. Labels now sit beneath the title inside the text column instead of becoming a cramped extra column. A regression test reproduces the observed layout. All 63 offline tests pass.

## 0.1.4 (2026-09-21)

Initial public release. Filters desktop YouTube cards against a fixed goal using Jev through a user-provided OpenRouter key. Includes colour-coded relevance labels, reversible hiding, show/hide all controls, separate settings and saved videos, and playback bookmarks.

The release passes 62 offline tests. The repository includes the frozen 15-goal relevance evaluation and explicitly versioned historical live checks. Current interface changes still need a fresh full live-browser check. No Chrome Web Store listing is available.

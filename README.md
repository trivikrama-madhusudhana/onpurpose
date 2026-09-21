<p><img src="icons/onpurpose.svg" alt="OnPurpose logo" width="80" height="80"></p>

# OnPurpose

OnPurpose is a desktop Chrome extension that filters YouTube recommendations against the problem you came to solve. Enter a goal, and Jev labels the available video metadata, hiding clear distractions behind a Reveal button.

[Download the extension](https://github.com/trivikrama-madhusudhana/onpurpose/releases/latest/download/onpurpose-extension.zip) · [Installation guide](docs/INSTALL.md) · [Report a problem](https://github.com/trivikrama-madhusudhana/onpurpose/issues)

The extension is free and open source. You need your own OpenRouter API key, and OpenRouter charges for model usage. It works on desktop Chrome at `www.youtube.com`; it does not run in the YouTube phone app. It is not listed in the Chrome Web Store yet.

## What it does

Your goal stays fixed while you browse. For example, “Fix buzzing strings when I play barre chords” is more useful than “guitar.” Recommendations are compared with that goal, even when your search changes.

| Label | Colour | Behaviour |
|---|---|---|
| Relevant to your goal | Green | Stays visible |
| Useful background | Blue | Stays visible |
| Relevance uncertain | Amber | Stays visible |
| Outside your goal | Rose | Hidden behind Reveal video |

Click a label for an explanation. **Show off-topic** reveals all hidden cards. **Hide off-topic** hides them again, including cards you revealed individually. **Pause filtering** restores the original videos. **Save video** bookmarks a video and its playback position; **Saved videos** opens your local list.

## The tricky parts

YouTube reuses cards as you scroll and changes pages without a full reload. The extension matches decisions to the goal and full video metadata, so an old response cannot hide a different video or overwrite a changed goal.

An uncertain decision should not remove a potentially useful tutorial. Hiding requires both a tangent probability of at least 0.80 and a collapse probability of at least 0.70. A tangent below either threshold is labelled uncertain and stays visible. Missing keys and request errors also leave videos visible.

Jev reads titles, channel names and available descriptions. It does not watch the video, check factual accuracy or prove that a tutorial solves your problem. The [evaluation report](evaluation/RESULTS.md) records 15 goals and 381 cards, including limitations and a missed development target. Those results are observations from a fixed sample, not an accuracy guarantee.

## Install without coding

Download [onpurpose-extension.zip](https://github.com/trivikrama-madhusudhana/onpurpose/releases/latest/download/onpurpose-extension.zip), extract it, and load the extracted folder in Chrome using **Load unpacked** at `chrome://extensions`. No terminal, Node.js or build step is needed. The [installation guide](docs/INSTALL.md) walks through every click, API key setup, updates and common problems.

Keep the extracted folder somewhere permanent. Chrome reads the extension from that folder. On the first toolbar click, enter your OpenRouter key. Refresh YouTube, enter your goal in the bar below its search box, then choose **Set goal**.

## Cost and privacy

Your goal and video metadata are sent directly to OpenRouter and its Jev provider. Your key is stored in this Chrome profile and used only by the extension's background service. There is no developer server, account, analytics or subscription. Saved videos stay local. See [PRIVACY.md](PRIVACY.md).

Settings shows reported usage, not your OpenRouter account balance. The frozen 381-card sample reported about $0.015 for one pass, excluding development retries and separate checks. That is a historical measurement, not a price promise. The extension uses OpenRouter's alpha decisions endpoint and `~typesafe/jev-latest`, so provider availability and behaviour can change.

## Develop and verify

Use Node.js 22 or later:

```sh
npm ci
npm test
```

The release source passes 63 automated tests. Earlier versions also have recorded live YouTube checks; the current release's latest interface changes have not yet had a fresh full live check. See the [verification record](evaluation/RESULTS.md#public-release-014).

There is no bundler. Chrome loads `manifest.json` and the local files in `src/`. To reproduce the frozen relevance evaluation without making paid requests:

```sh
node scripts/score.mjs --run evaluation/frozen-run --split all
```

[CONTRIBUTING.md](CONTRIBUTING.md) describes the source layout and testing boundaries. [scripts/README.md](scripts/README.md) covers optional live evaluation, which makes paid API calls.

## License

[MIT](LICENSE). Built by [Trivikrama Madhusudhana](https://github.com/trivikrama-madhusudhana). Not affiliated with YouTube, Google, OpenRouter or TypeSafe AI.

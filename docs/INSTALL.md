# Install OnPurpose in Chrome

You do not need to code or use a terminal. You need desktop Google Chrome and an OpenRouter account with an API key and available credits. Chrome on a phone and the YouTube phone app are not supported.

## 1. Download and extract

1. Click [Download OnPurpose](https://github.com/trivikrama-madhusudhana/onpurpose/releases/latest/download/onpurpose-extension.zip).
2. Open the downloaded ZIP. On a Mac, double-click it. On Windows, right-click it and choose **Extract All**.
3. Move the extracted `onpurpose-extension` folder somewhere you will keep it, such as Documents. Open it once and check that you can see a file named `manifest.json` and a folder named `src`.

Choose the extension ZIP above, not GitHub's automatically generated “Source code” ZIP. The extension ZIP contains only the files Chrome needs.

## 2. Add it to Chrome

1. Copy `chrome://extensions`, paste it into Chrome's address bar, and press Enter.
2. Turn on **Developer mode** at the top right. This allows Chrome to load the open-source folder you downloaded.
3. Click **Load unpacked** at the top left.
4. Select the extracted `onpurpose-extension` folder that contains `manifest.json`. Select the folder, not the ZIP or the `src` folder.
5. Check that an **OnPurpose** card appears and its switch is on.
6. Click Chrome's puzzle-piece Extensions icon, then the pin next to OnPurpose so it stays easy to find.

Do not move or delete the extracted folder after installation. This is a manually installed extension, so updates are manual too. A work-managed browser may prevent this installation; ask your administrator rather than trying to bypass that restriction.

## 3. Add your OpenRouter key

1. Open [OpenRouter's API keys page](https://openrouter.ai/settings/keys) and sign in or create your account.
2. Create an API key. Give it a recognisable name such as “OnPurpose” and set a spending limit if offered. Copy the key. Keep it private.
3. Make sure your OpenRouter account has available credits and access to Jev. The extension is free; model requests use your credits.
4. Click OnPurpose in the Chrome toolbar. The first click opens **Settings and usage**.
5. Paste the key into **New API key**, then choose **Save key**. The field clears after saving; that is expected.

The key stays in this Chrome profile. It is sent to OpenRouter to authenticate requests and is not given to YouTube. You can replace or remove it in Settings and usage.

## 4. Use it on YouTube

1. Open [YouTube](https://www.youtube.com/). If it was already open, refresh the page.
2. Find **Your YouTube goal** below YouTube's search box.
3. Enter a specific problem, such as “Fix buzzing strings when I play barre chords,” and choose **Set goal**.
4. Search or browse normally. Allow time for the visible cards to be checked. New cards are checked as you scroll.

Relevant and background videos remain visible. Uncertain videos remain visible too. Videos labelled **Outside your goal** are replaced by their title and a **Reveal video** button. You can reveal one, or use **Show off-topic** at the top to see all of them. **Hide off-topic** hides them all again.

Your goal does not change just because you type a new YouTube search. Edit the goal and press Set goal when you switch tasks. **Pause filtering** restores all videos and stops new classification jobs; requests already sent may finish.

While watching a video, **Save video** saves its playback position. Click **Video saved** to undo that bookmark. **Saved videos** opens the list; **Settings** opens API key and usage controls. These are separate pages.

## Update

Download the new extension ZIP from [Releases](https://github.com/trivikrama-madhusudhana/onpurpose/releases/latest). Replace the files inside your existing extension folder with the new files. Keep the same folder path. Open `chrome://extensions`, click the reload arrow on the OnPurpose card, then refresh YouTube. Your saved key and bookmarks remain in Chrome storage. Do not remove and reinstall the extension just to update it.

## Troubleshooting

| What you see | What to do |
|---|---|
| No goal bar | Refresh YouTube. Check that OnPurpose is enabled at `chrome://extensions` and that the address starts with `https://www.youtube.com/`. The popup also offers Refresh YouTube. |
| “Manifest file is missing” | Extract the ZIP first. Select the folder that directly contains `manifest.json`. |
| Settings keeps asking for a key | Save a key and check for an error message. Chrome profiles have separate settings. |
| OpenRouter rejects the key | Open Settings and usage, paste the complete key again, and save it. Check OpenRouter if it was revoked. |
| Credit unavailable | Check your balance and any key spending limit in OpenRouter. |
| Rate limit or provider error | Videos remain visible. Wait, then choose Retry. The alpha Jev endpoint can change or be unavailable. |
| A useful video is hidden | Choose Reveal video. Metadata can be misleading, so the model can be wrong. |
| Old buttons after updating | Reload the extension at `chrome://extensions`, then refresh every open YouTube tab. |
| Saved videos seem missing | Use the same Chrome profile. Bookmarks are local and do not sync between devices. |

## Remove it

Open `chrome://extensions`, find OnPurpose, and choose **Remove**. Removing the extension also removes its locally stored key, goal, bookmarks and usage totals. You can revoke its API key separately on OpenRouter.

For help, [open an issue](https://github.com/trivikrama-madhusudhana/onpurpose/issues) with your Chrome version, extension version and what went wrong. Never include your API key. Hide personal information before attaching screenshots.

# Install OnPurpose in Chrome

Use Google Chrome on a computer. You do not need to code. This does not work in Chrome on a phone or in the YouTube phone app.

You will also need an OpenRouter account. The steps below explain how to connect it. OnPurpose is free. OpenRouter charges for use.

## 1. Download and open the folder

1. Click [Download OnPurpose](https://github.com/trivikrama-madhusudhana/onpurpose/releases/latest/download/onpurpose-extension.zip).
2. Find `onpurpose-extension.zip` in your Downloads folder.
3. Open it. **Mac:** double-click the ZIP. **Windows:** right-click it and choose **Extract All**.
4. Open the new folder. Look for a file named `manifest.json`. If you see another `onpurpose-extension` folder instead, open that folder too.
5. Move the folder containing `manifest.json` to **Documents**. Keep it there. Chrome needs it to run OnPurpose.

Use the download link above. You do not need GitHub's **Code** button or the **Source code** downloads.

## 2. Add it to Chrome

1. Open Chrome. Paste `chrome://extensions` into the address bar at the top. Press **Enter**.
2. Turn on **Developer mode** at the top right.
3. Click **Load unpacked** at the top left.
4. Select the folder you moved to Documents. Choose the folder, not the ZIP file or the `src` folder inside it.
5. You should now see **OnPurpose** in the list. Check that its switch is on.
6. Click the puzzle-piece icon near Chrome's address bar. Click the pin next to **OnPurpose** to keep its icon visible.

Do not move or delete the folder after this. If a work computer blocks installation, ask your IT team for help.

## 3. Connect OpenRouter

An API key connects OnPurpose to your OpenRouter account. Treat it like a password.

1. Open [OpenRouter](https://openrouter.ai/settings/keys). Sign in or create an account.
2. Create an API key. Name it “OnPurpose” and copy it.
3. Make sure your OpenRouter account has credit. You can set a spending limit for the key.
4. In Chrome, click the puzzle-piece icon. Click **OnPurpose**. Its settings will open.
5. Paste the key into **New API key**. Click **Save key**.

The key box becomes empty after saving. This is normal.

The key stays in this Chrome profile. It is sent to OpenRouter to authenticate requests and is not given to YouTube. You can replace or remove it in Settings and usage.

## 4. Use it on YouTube

1. Open [YouTube](https://www.youtube.com/). Refresh the page if it was already open.
2. Find **Your YouTube goal** below the search box.
3. Type what you want to learn, such as “Learn to fold a fitted sheet.” Click **Set goal**.
4. Search or browse as usual. Give OnPurpose a moment to label the videos.

Relevant and background videos remain visible. Uncertain videos remain visible too. Videos labelled **Outside your goal** are replaced by their title and a **Reveal video** button. You can reveal one, or use **Show off-topic** at the top to see all of them. **Hide off-topic** hides them all again.

Your goal does not change just because you type a new YouTube search. Edit the goal and press Set goal when you switch tasks. **Pause filtering** restores all videos and stops new classification jobs; requests already sent may finish.

While watching a video, **Save video** saves its playback position. Click **Video saved** to undo that bookmark. **Saved videos** opens the list; **Settings** opens API key and usage controls. These are separate pages.

## Turn OnPurpose on or off

Click the OnPurpose toolbar icon and use its **On / Off** switch. You can also right-click the icon and choose **Turn OnPurpose off** or **Turn OnPurpose on**.

Off removes the goal bar, labels and reminder popup, restores hidden videos, and stops new model requests. Requests in progress are aborted, but requests already sent may still be charged by the provider. Your key, goal, bookmarks, reminder delay and filtering pause state are saved. Turn it on again to restore that setup without refreshing YouTube. If filtering was paused, it stays paused.

## Update

1. [Download the latest ZIP](https://github.com/trivikrama-madhusudhana/onpurpose/releases/latest/download/onpurpose-extension.zip).
2. Open it as you did when installing.
3. Copy the files inside the new extension folder into your existing folder in Documents. Choose **Replace** when asked.
4. In Chrome, open `chrome://extensions`.
5. Find **OnPurpose**. Click its circular reload arrow.
6. Refresh your open YouTube tabs.

Keep the same folder in Documents. Do not remove OnPurpose from Chrome to update it. Your saved key and videos will stay in place.

## Troubleshooting

| What you see | What to do |
|---|---|
| No goal bar | Open the OnPurpose toolbar popup and check its On / Off switch. If it is on, refresh YouTube and check that the extension is enabled at `chrome://extensions`. The address must start with `https://www.youtube.com/`. |
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

### Saved settings could not be opened securely

Reload OnPurpose at `chrome://extensions`, then open its settings again. If the error persists, contact trivikrama@theautomationcraft.com before reinstalling. Reinstalling removes saved videos and settings.

## Change the reminder delay

Open OnPurpose's **Settings**, the same page where you add your OpenRouter API key. Under **Goal reminders**, change the number and choose **Save reminder**. The default is 10 minutes. You can use any positive whole number, such as 1, 5 or 20. Zero, negative numbers and fractions are not accepted.

This counts time spent playing clearly off-topic videos while YouTube has focus. At the chosen delay, a centered popup appears over the video during playback, in normal view or fullscreen. The video keeps playing. Relevant and uncertain videos do not trigger it.

Close the popup with **X** or **Esc** to start the timer again. Choose **This video helps** to mark the video relevant, **Back to my goal** to return to your last useful video, or **Keep exploring** to dismiss reminders for this goal session. **Resume reminders** starts a fresh timer after Keep exploring.

Goal reminders currently work on regular YouTube watch pages. Shorts and videos with unreadable metadata do not trigger reminders.

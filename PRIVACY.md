# Privacy policy

Updated September 21, 2026.

OnPurpose has no analytics, advertising, developer server, account system or telemetry.

## Stored locally

Your OpenRouter API key, current goal, pause state, reminder delay, saved videos (titles, YouTube links, saved playback positions, saved dates and the associated goal) and cumulative API usage are encrypted with AES-GCM before being stored in this extension's `chrome.storage.local`. The non-exportable encryption key is kept in the extension's IndexedDB. This protects stored values from being read as plain text; it does not protect against someone who controls your browser profile or computer. The extension restricts storage access to trusted extension contexts. The key is not placed in the web page, returned to content scripts, synced through Chrome, or bundled into the source. Removing the key in settings removes the stored value. Uninstalling the extension removes its local storage.

## Reminder session

The extension uses whether YouTube has focus and whether a video is playing to count time spent watching off-topic videos. Elapsed time, reminder choices, videos marked helpful and the last useful video's link and playback position stay in `chrome.storage.session`, which Chrome holds in memory. This state is restricted to trusted extension contexts and is cleared when you start a new goal or restart Chrome. It is not sent to OpenRouter or a developer server.

## Sent to providers

When filtering is active, the background service sends your goal and supported video cards' or the current video's available title, channel and description text to OpenRouter's typed decisions endpoint. OpenRouter routes the request to the selected Jev provider. Provider retention and processing follow their respective policies. The request carries your OpenRouter key as authentication, not as model input.

The extension does not upload audio, video, cookies, your browser history, passwords or the entire page. Visible metadata can still reveal what you are researching. YouTube page and saved-video URLs are processed locally. Saved videos remain local; there is no automatic cloud backup.

## Permissions and controls

- `storage`: save settings and session state locally.
- `https://openrouter.ai/*`: make authenticated background API requests.
- `https://www.youtube.com/*`: find or focus YouTube tabs, notify the goal bar when toolbar controls change, and refresh YouTube only when you choose that action.
- Content script match `https://www.youtube.com/*`: read supported video cards and display the goal bar and reversible relevance labels.

Pause stops new classification jobs and restores cards. Requests already sent may finish and incur provider charges. Clearing or changing the goal prevents their old decisions from being applied. The extension never clicks play, changes your YouTube account settings or publishes anything.

## Use of data

OnPurpose uses this data only to provide its visible filtering, settings and saved-video features. It does not sell user data, use it for advertising, or use it to determine creditworthiness or lending eligibility. OnPurpose complies with the Chrome Web Store User Data Policy, including its Limited Use requirements.

## Contact

For support or privacy questions, email trivikrama@theautomationcraft.com.

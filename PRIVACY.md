# Data handling

OnPurpose has no analytics, advertising, developer server, account system or telemetry.

## Stored locally

Your OpenRouter API key, current goal, pause state, saved videos and cumulative API usage are stored in this extension's `chrome.storage.local`. The extension restricts storage access to trusted extension contexts. The key is not placed in the web page, returned to content scripts, synced through Chrome, or bundled into the source. Removing the key in settings removes the stored value. Uninstalling the extension removes its local storage.

## Sent to providers

When filtering is active, the background service sends your goal and supported video cards' available title, channel and description text to OpenRouter's typed decisions endpoint. OpenRouter routes the request to the selected Jev provider. Provider retention and processing follow their respective policies. The request carries your OpenRouter key as authentication, not as model input.

The extension does not upload audio, video, cookies, your browser history, passwords or the entire page. Visible metadata can still reveal what you are researching. Saved videos remain local; there is no automatic cloud backup.

## Permissions and controls

- `storage`: save settings and session state locally.
- `https://openrouter.ai/*`: make authenticated background API requests.
- `https://www.youtube.com/*`: find or focus YouTube tabs, notify the goal bar when toolbar controls change, and refresh YouTube only when you choose that action.
- Content script match `https://www.youtube.com/*`: read supported video cards and display the goal bar and reversible relevance labels.

Pause stops new classification jobs and restores cards. Requests already sent may finish and incur provider charges. Clearing or changing the goal prevents their old decisions from being applied. The extension never clicks play, changes your YouTube account settings or publishes anything.

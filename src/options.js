const form = document.querySelector('#key-form');
const keyInput = document.querySelector('#api-key');
const saveButton = document.querySelector('#save-key');
const removeButton = document.querySelector('#remove-key');
const status = document.querySelector('#status');
let hasKey = false;

function render(state) {
  hasKey = state.hasKey === true;
  document.querySelector('#key-status').textContent = hasKey ? 'A key is saved. Paste a new key to replace it.' : 'No key is saved. YouTube videos remain visible until you add one.';
  document.querySelector('#ready').hidden = !hasKey;
  removeButton.disabled = !hasKey;
  const usage = state.usage || {};
  document.querySelector('#usage').textContent = `${usage.requests || 0} requests · ${usage.inputTokens || 0} input tokens · $${Number(usage.cost || 0).toFixed(6)} reported cost`;

}
async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response || response.error) throw new Error(response?.error || 'Settings are unavailable. Try reopening this page.');
  return response;
}
async function save(message) {
  saveButton.disabled = true;
  removeButton.disabled = true;
  status.textContent = 'Saving…';
  try {
    const state = await request(message);
    keyInput.value = '';
    render(state);
    status.textContent = message.removeKey ? 'Key removed. Videos remain visible.' : 'Key saved. Open YouTube below, or reload your existing YouTube tab, then enter your goal in the bar beneath the search box.';
  } catch (error) {
    // Do not echo user-entered key or log settings messages.
    status.textContent = error.message.includes(keyInput.value || '\0') ? 'Could not save your key. Try again.' : error.message;
  } finally {
    saveButton.disabled = false;
    removeButton.disabled = !hasKey;
  }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const key = keyInput.value.trim();
  if (!key) { status.textContent = 'Paste a key before saving.'; keyInput.focus(); return; }
  save({ type: 'SAVE_SETTINGS', key });
});
removeButton.addEventListener('click', () => save({ type: 'SAVE_SETTINGS', removeKey: true }));
request({ type: 'GET_SETTINGS' }).then(render).catch(() => { status.textContent = 'Settings could not be loaded. Reopen this page to try again.'; });

window.addEventListener('focus', () => request({type:'GET_SETTINGS'}).then(render).catch(() => {}));

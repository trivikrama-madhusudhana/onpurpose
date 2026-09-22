const form = document.querySelector('#key-form');
const keyInput = document.querySelector('#api-key');
const saveButton = document.querySelector('#save-key');
const removeButton = document.querySelector('#remove-key');
const status = document.querySelector('#status');
const reminderForm = document.querySelector('#reminder-form');
const reminderInput = document.querySelector('#reminder-minutes');
const reminderButton = document.querySelector('#save-reminder');
const reminderStatus = document.querySelector('#reminder-status');
let hasKey = false;
let reminderDirty = false;
let reminderEditVersion = 0;
let requestVersion = 0;
const mutationEpochs = { key: 0, reminder: 0 };
const renderedVersions = { key: 0, reminder: 0, usage: 0 };

function render({ state, context }) {
  // Completing a save invalidates reads started before or during that save.
  const mutation = context.mutation;
  if (mutation && context.epochs[mutation] === mutationEpochs[mutation]) {
    context.epochs[mutation] = ++mutationEpochs[mutation];
  }
  function canRender(field) {
    if (field !== 'usage' && context.epochs[field] !== mutationEpochs[field]) return false;
    if (field !== mutation && context.version < renderedVersions[field]) return false;
    renderedVersions[field] = context.version;
    return true;
  }
  if (canRender('key')) {
    hasKey = state.hasKey === true;
    document.querySelector('#key-status').textContent = hasKey ? 'A key is saved. Paste a new key to replace it.' : 'No key is saved. YouTube videos remain visible until you add one.';
    document.querySelector('#ready').hidden = !hasKey;
    removeButton.disabled = saveButton.disabled || !hasKey;
  }
  if (canRender('usage')) {
    const usage = state.usage || {};
    document.querySelector('#usage').textContent = `${usage.requests || 0} requests · ${usage.inputTokens || 0} input tokens · $${Number(usage.cost || 0).toFixed(6)} reported cost`;
  }
  if (canRender('reminder') && !reminderDirty) {
    reminderInput.value = String(Number.isSafeInteger(state.reminderMinutes) && state.reminderMinutes > 0 ? state.reminderMinutes : 10);
  }
}
async function request(message) {
  const mutation = message.type === 'SAVE_SETTINGS' ? 'key' : message.type === 'SAVE_REMINDER_SETTINGS' ? 'reminder' : null;
  if (mutation) mutationEpochs[mutation] += 1;
  const context = { mutation, version: ++requestVersion, epochs: { ...mutationEpochs } };
  const response = await chrome.runtime.sendMessage(message);
  if (!response || response.error) throw new Error(response?.error || 'Settings are unavailable. Try reopening this page.');
  return { state: response, context };
}
async function save(message) {
  if (saveButton.disabled) return;
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
reminderInput.addEventListener('input', () => {
  reminderDirty = true;
  reminderEditVersion += 1;
  reminderInput.removeAttribute('aria-invalid');
  if (!reminderButton.disabled) reminderStatus.textContent = '';
});
reminderForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (reminderButton.disabled) return;
  const value = reminderInput.value.trim();
  const minutes = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(minutes) || minutes < 1) {
    reminderStatus.textContent = 'Enter a positive whole number of minutes.';
    reminderInput.setAttribute('aria-invalid', 'true');
    reminderInput.focus();
    return;
  }
  const submittedVersion = reminderEditVersion;
  reminderButton.disabled = true;
  reminderInput.removeAttribute('aria-invalid');
  reminderStatus.textContent = 'Saving…';
  try {
    const state = await request({ type: 'SAVE_REMINDER_SETTINGS', minutes });
    if (reminderEditVersion === submittedVersion) reminderDirty = false;
    render(state);
    reminderStatus.textContent = reminderDirty ? 'Reminder saved. Your latest edit has not been saved.' : 'Reminder saved.';
  } catch {
    reminderStatus.textContent = 'Could not save your reminder. Try again.';
  } finally {
    reminderButton.disabled = false;
  }
});
request({ type: 'GET_SETTINGS' }).then(render).catch(() => { status.textContent = 'Settings could not be loaded. Reopen this page to try again.'; });

window.addEventListener('focus', () => request({type:'GET_SETTINGS'}).then(render).catch(() => {}));

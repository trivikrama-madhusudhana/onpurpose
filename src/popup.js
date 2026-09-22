const $ = selector => document.querySelector(selector);
let state = null;
let youtube = { hasTab: false, ready: false };
let busy = false;
let goalDirty = false;
let stateRequest = 0;
async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response || response.error) throw new Error(response?.error || 'OnPurpose is unavailable. Reopen the popup and try again.');
  return response;
}
function status(message, error = false) {
  $('#status').textContent = message;
  $('#status').dataset.error = String(error);
}
function render() {
  if (!state) return;
  const configured = state?.hasKey === true;
  const enabled = state.enabled !== false;
  $('#loading').hidden = true;
  $('#power').hidden = false;
  $('#enabled').setAttribute('aria-checked', String(enabled));
  $('#enabled').disabled = busy;
  $('#power-value').textContent = enabled ? 'On' : 'Off';
  $('#power-note').textContent = enabled ? 'Your YouTube focus tools are on.' : 'Plain YouTube. Your setup is saved.';
  $('#session').hidden = !configured;
  $('#setup').hidden = configured || !enabled;
  $('#usage').hidden = !configured;
  if (!goalDirty && document.activeElement !== $('#goal')) $('#goal').value = state.goal || '';
  $('#goal').disabled = busy || !enabled;
  $('#start').textContent = youtube.hasTab && !youtube.ready ? 'Start and refresh YouTube' : 'Start on YouTube';
  $('#start').disabled = busy || !enabled;
  $('#pause').textContent = state.active ? 'Pause' : 'Resume';
  $('#pause').disabled = busy || !enabled || !state.goal?.trim();
  $('#open-youtube').textContent = youtube.hasTab ? 'Go to YouTube' : 'Open YouTube';
  $('#open-youtube').disabled = busy;
  $('#refresh-youtube').disabled = busy || !enabled;
  $('#refresh-help').hidden = !enabled || !youtube.hasTab || youtube.ready;
  $('#session-status').textContent = !enabled ? 'Turn on OnPurpose to use your goal.' : !state.goal?.trim() ? 'Set a specific problem to start filtering.' : state.active ? 'Filtering is on for YouTube. Uncertain videos stay visible.' : 'Filtering is paused. Your goal is saved.';
  const usage = state.usage || {};
  const cost = typeof usage.cost === 'number' && Number.isFinite(usage.cost) ? usage.cost : 0;
  $('#usage').textContent = `${usage.requests || 0} recorded requests · $${cost.toFixed(6)} reported cost`;
}
async function readState() {
  const current = ++stateRequest;
  const response = await request({ type: 'GET_POPUP_STATE' });
  if (current !== stateRequest) return false;
  state = response;
  youtube = response.youtube || youtube;
  render();
  return true;
}
async function mutate(message) {
  const current = ++stateRequest;
  const response = await request(message);
  if (current === stateRequest) { state = response; return true; }
  // A newer notification may have arrived while this action was saving.
  // Read again so an old action reply cannot undo a newer On/Off change.
  return await readState();
}
async function openSettings() {
  try { await request({ type: 'OPEN_SETTINGS' }); window.close(); }
  catch { status('Settings could not be opened. Try the extension details page.', true); }
}
async function openYouTube(reload = false) {
  const response = await request({ type: 'OPEN_YOUTUBE', reload });
  if (response.needsReload) {
    youtube = { hasTab: true, ready: false };
    render();
    status('Refresh YouTube to show the goal bar and apply your saved goal.');
  } else {
    status(response.reloaded ? 'YouTube is refreshing with your saved goal.' : 'Your goal is ready on YouTube.');
    window.close();
  }
}
async function action(fn) {
  if (busy) return;
  busy = true; render(); status('Applying...');
  try { await fn(); }
  catch (error) { status(error.message, true); }
  finally { busy = false; render(); }
}
$('#goal').addEventListener('input', () => { goalDirty = true; });
$('#enabled').addEventListener('click', () => action(async () => {
  const enabled = state.enabled === false;
  if (!await mutate({ type: 'SET_ENABLED', enabled })) return;
  if (enabled && state.enabled !== false && !state.hasKey) {
    status('Add your OpenRouter key to get started. Opening settings...');
    await openSettings();
  } else status(state.enabled === false ? 'OnPurpose is off. Your setup is saved.' : 'OnPurpose is on.');
}));
$('#goal-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!state?.hasKey || state.enabled === false) return;
  const goal = $('#goal').value.trim();
  if (!goal) { status('Describe the problem you came to YouTube to solve.', true); $('#goal').focus(); return; }
  action(async () => {
    if (!await mutate({ type: 'SET_GOAL', goal })) return;
    if (state.goal === goal && $('#goal').value.trim() === goal) goalDirty = false;
    if (state.enabled !== false && state.goal === goal) await openYouTube(youtube.hasTab && !youtube.ready);
    else status('Your goal is saved.');
  });
});
$('#pause').addEventListener('click', () => action(async () => {
  if (state.enabled === false) return;
  if (!await mutate({ type: 'SET_ACTIVE', active: !state.active })) return;
  status(state.enabled === false ? 'OnPurpose is off. Your setup is saved.' : state.active ? 'Filtering resumed on YouTube.' : 'Filtering paused. Original videos are visible.');
}));
$('#open-youtube').addEventListener('click', () => action(() => openYouTube()));
$('#refresh-youtube').addEventListener('click', () => action(() => state.enabled !== false && openYouTube(true)));
$('#saved').addEventListener('click', async () => {
  try { await request({ type: 'OPEN_SAVED' }); window.close(); }
  catch { status('Saved videos could not be opened. Try again.', true); }
});
$('#settings').addEventListener('click', openSettings);
$('#setup').addEventListener('click', openSettings);
chrome.runtime.onMessage?.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.type !== 'STATE_CHANGED') return;
  readState().catch(error => status(error.message, true));
  sendResponse?.({ ok: true });
});
(async () => {
  try {
    const loaded = await readState();
    if (loaded && state.enabled !== false && !state.hasKey) { status('Add your OpenRouter key to get started. Opening settings...'); await openSettings(); }
  } catch (error) {
    $('#loading').hidden = true;
    $('#setup').hidden = false;
    status(error.message, true);
  }
})();

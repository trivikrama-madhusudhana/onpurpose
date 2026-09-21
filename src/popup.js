const $ = selector => document.querySelector(selector);
let state = null;
let youtube = { hasTab: false, ready: false };
let busy = false;
async function request(message) {
  const response = await chrome.runtime.sendMessage(message);
  if (!response || response.error) throw new Error(response?.error || 'Idea Flow is unavailable. Reopen the popup and try again.');
  return response;
}
function status(message, error = false) {
  $('#status').textContent = message;
  $('#status').dataset.error = String(error);
}
function render() {
  const configured = state?.hasKey === true;
  $('#loading').hidden = true;
  $('#session').hidden = !configured;
  $('#setup').hidden = configured;
  if (!configured) return;
  if (document.activeElement !== $('#goal')) $('#goal').value = state.goal || '';
  $('#start').textContent = youtube.hasTab && !youtube.ready ? 'Start and refresh YouTube' : 'Start on YouTube';
  $('#start').disabled = busy;
  $('#pause').textContent = state.active ? 'Pause' : 'Resume';
  $('#pause').disabled = busy || !state.goal?.trim();
  $('#open-youtube').textContent = youtube.hasTab ? 'Go to YouTube' : 'Open YouTube';
  $('#open-youtube').disabled = busy;
  $('#refresh-youtube').disabled = busy;
  $('#refresh-help').hidden = !youtube.hasTab || youtube.ready;
  $('#session-status').textContent = !state.goal?.trim() ? 'Set a specific problem to start filtering.' : state.active ? 'Filtering is on for YouTube. Uncertain videos stay visible.' : 'Filtering is paused. Your goal is saved.';
  const usage = state.usage || {};
  const cost = typeof usage.cost === 'number' && Number.isFinite(usage.cost) ? usage.cost : 0;
  $('#usage').textContent = `${usage.requests || 0} recorded requests · $${cost.toFixed(6)} reported cost`;
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
$('#goal-form').addEventListener('submit', event => {
  event.preventDefault();
  const goal = $('#goal').value.trim();
  if (!goal) { status('Describe the problem you came to YouTube to solve.', true); $('#goal').focus(); return; }
  action(async () => {
    state = await request({ type: 'SET_GOAL', goal });
    await openYouTube(youtube.hasTab && !youtube.ready);
  });
});
$('#pause').addEventListener('click', () => action(async () => {
  state = await request({ type: 'SET_ACTIVE', active: !state.active });
  status(state.active ? 'Filtering resumed on YouTube.' : 'Filtering paused. Original videos are visible.');
}));
$('#open-youtube').addEventListener('click', () => action(() => openYouTube()));
$('#refresh-youtube').addEventListener('click', () => action(() => openYouTube(true)));
$('#saved').addEventListener('click', async () => {
  try { await request({ type: 'OPEN_SAVED' }); window.close(); }
  catch { status('Saved videos could not be opened. Try again.', true); }
});
$('#settings').addEventListener('click', openSettings);
$('#setup').addEventListener('click', openSettings);
(async () => {
  try {
    state = await request({ type: 'GET_POPUP_STATE' });
    youtube = state.youtube || youtube;
    render();
    if (!state.hasKey) { status('Add your OpenRouter key to get started. Opening settings...'); await openSettings(); }
  } catch (error) {
    $('#loading').hidden = true;
    $('#setup').hidden = false;
    status(error.message, true);
  }
})();

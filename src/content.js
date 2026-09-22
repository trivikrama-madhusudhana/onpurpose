/* OnPurpose: isolated, YouTube-only content UI. No credentials enter this script. */
(() => {
  'use strict';
  const LABELS = new Set(['direct', 'background', 'tangent', 'unclear']);
  const {videoURL, extractVideo, getVideoCards, text, CARD_SELECTORS} = globalThis.OnPurposeDOM;
  function metadataKey(goal, video) {
    return JSON.stringify([goal, video.id, video.title, video.channel, video.description || '']);
  }
  function shouldCollapse(result, showTangents, revealed) {
    return !showTangents && !revealed && result?.label === 'tangent' && Number.isFinite(result.tangentProbability) && result.tangentProbability >= 0.8 && result.tangentProbability <= 1 && Number.isFinite(result.collapseProbability) && result.collapseProbability >= 0.7 && result.collapseProbability <= 1;
  }
  function displayLabel(result) {
    // Use the same decision for the visible label and the default hide behaviour.
    return result?.label === 'tangent' && !shouldCollapse(result, false, false) ? 'unclear' : result?.label;
  }
  // Pure helpers are also exercised by the local Node test suite.
  if (typeof module !== 'undefined' && module.exports) module.exports = {videoURL, extractVideo, metadataKey, shouldCollapse, displayLabel, CARD_SELECTORS};
  if (typeof document === 'undefined' || location.origin !== 'https://www.youtube.com' || window.top !== window || document.getElementById('onpurpose-root')) return;

  let state = {goal: '', active: false, hasKey: false, saved: [], usage: {}};
  let epoch = 0, busy = false, scanTimer, refreshTimer, destroyed = false;
  let showTangents = false, lastError = '', pending = 0, cooldownUntil = 0;
  let mutationRevision = 0, readRevision = 0, mutationPending = false, draftDirty = false, draftRevision = 0;
  let reminderSession = null, reminderSessionKey = '', reminderLoad = 0, reminderTimer;
  let watchRevision = 0, currentWatch = null, navigating = false, watchedURL = location.href, lastPersistAt = 0, persistedReminder = '';
  const decisions = new Map(), inflight = new Set(), records = new Map();
  const MAX_LOCAL_CACHE = 1500;
  const host = document.createElement('div');
  host.id = 'onpurpose-root';
  const root = host.attachShadow({mode: 'open'});
  root.innerHTML = `
    <style>
      :host{all:initial;--surface:#f7faf8;--text:#17392d;--muted:#465d53;--line:#b8c9bf;--field:#fff;--accent:#215c40;--on-accent:#fff;--hover:#e5eee8;--error:#9d2b1c;color-scheme:light;display:block;font:14px/1.45 system-ui,-apple-system,sans-serif;color:var(--text)}
      :host([data-theme="dark"]){--surface:#18241f;--text:#edf5f0;--muted:#c0d1c6;--line:#60796b;--field:#111c16;--accent:#a0e2b9;--on-accent:#102c1b;--hover:#2a3c31;--error:#ffc3b6;color-scheme:dark}
      *{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer;border:1px solid var(--line);border-radius:7px;min-height:36px;padding:7px 12px;background:var(--surface);color:var(--text);white-space:nowrap}button:hover{background:var(--hover)}button:focus-visible,input:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}button:disabled{cursor:default;opacity:.6}input::placeholder{color:var(--muted);opacity:1}::selection{background:var(--accent);color:var(--on-accent)}
      .bar{padding:12px 20px;background:var(--surface);border-bottom:1px solid var(--line)}.goal-row{display:flex;gap:18px;align-items:center;min-width:0}.brand{display:flex;align-items:center;gap:9px;font-weight:750;font-size:16px;white-space:nowrap}.brand-mark{flex:none}.goal-form{display:flex;gap:8px;align-items:end;flex:1;min-width:0}.goal-field{flex:1;min-width:0}.goal-field label{display:block;font-size:12px;font-weight:650;margin-bottom:4px;color:var(--muted)}input{display:block;width:100%;min-width:0;background:var(--field);border:1px solid var(--line);border-radius:7px;padding:8px 10px;color:var(--text);caret-color:var(--text)}.primary{background:var(--accent);color:var(--on-accent);border-color:var(--accent);font-weight:650}.primary:hover{background:var(--accent);filter:brightness(.95)}
      .session-row{display:flex;gap:12px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-top:10px}.actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}.status{color:var(--muted);font-size:13px;display:flex;align-items:center;gap:8px;flex:1;min-width:200px}.status.error{color:var(--error)}.status button{min-height:30px;padding:3px 8px}.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:var(--surface);color:var(--text);padding:12px 18px;border:1px solid var(--line);border-radius:10px;max-width:min(540px,90vw);box-shadow:0 6px 24px #0003;z-index:2200}.help-link{background:transparent}
      .reminder{display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-top:1px solid var(--line);margin-top:12px;padding-top:12px}.reminder p{margin:0;flex:1;min-width:220px}.reminder-actions{display:flex;gap:8px;flex-wrap:wrap}
      [hidden]{display:none!important}@media(max-width:1050px){.goal-row{gap:12px}.bar{padding:12px 16px}.status{flex-basis:100%}.actions{width:100%}}@media(max-width:650px){.goal-row{display:block}.brand{display:flex;margin-bottom:8px}.goal-form{align-items:end}.actions{gap:6px}button{padding:7px 9px}}
    </style>
    <section class="bar" aria-label="OnPurpose YouTube focus">
      <div class="goal-row"><span class="brand"><svg class="brand-mark" aria-hidden="true" width="28" height="28" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#E85D26"/><g fill="none" stroke="#111111" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><path d="M16 25V20Q16 16 20 16H25"/><path d="M39 16H44Q48 16 48 20V25"/><path d="M48 39V44Q48 48 44 48H39"/><path d="M25 48H20Q16 48 16 44V39"/></g><path d="M27 23L41 32L27 41Z" fill="#111111" stroke="#111111" stroke-width="2" stroke-linejoin="round"/></svg><span>OnPurpose</span></span>
        <form class="goal-form"><div class="goal-field"><label for="goal">Your YouTube goal</label><input id="goal" maxlength="600" placeholder="What are you here to figure out?" autocomplete="off"></div><button class="primary" id="set-goal" type="submit">Set goal</button></form>
      </div>
      <div class="session-row">
        <div class="status" role="status" aria-live="polite"><span id="status-text">Connecting...</span><button id="retry" type="button" hidden>Retry</button></div>
        <div class="actions"><button id="pause" type="button">Resume filtering</button><button id="tangents" type="button" aria-pressed="false">Show off-topic</button><button id="save-video" type="button" aria-pressed="false" hidden>Save video</button><button id="resume-reminders" type="button" hidden>Resume reminders</button><button id="saved" type="button">Saved videos</button><button id="settings" class="help-link" type="button">Settings</button></div>
      </div>
      <div class="reminder" id="reminder" hidden><p id="reminder-text" role="status" aria-live="polite"></p><div class="reminder-actions"><button class="primary" id="back-to-goal" type="button">Back to my goal</button><button id="video-helps" type="button">This video helps</button><button id="keep-exploring" type="button">Keep exploring</button></div></div>
    </section><div class="toast" role="status" hidden></div>`;
  const $ = selector => root.querySelector(selector);
  let layoutFrame = null;
  function syncLayout() {
    layoutFrame = null;
    const page = document.querySelector('ytd-page-manager');
    const masthead = document.querySelector('ytd-masthead');
    const parentLeft = host.parentElement?.getBoundingClientRect().left || 0;
    const inset = Math.max(0, (page?.getBoundingClientRect().left || 0) - parentLeft);
    const headerHeight = Math.max(0, masthead?.getBoundingClientRect().height || 56);
    host.style.setProperty('--onpurpose-inset', `${inset}px`);
    host.style.setProperty('--onpurpose-header', `${headerHeight}px`);
    host.dataset.theme = document.documentElement.hasAttribute('dark') ? 'dark' : 'light';
  }
  function scheduleLayout() { if (!layoutFrame) layoutFrame = requestAnimationFrame(syncLayout); }
  function mount() {
    const pageManager = document.querySelector('ytd-page-manager');
    if (pageManager?.parentElement) {
      if (host.parentElement === pageManager.parentElement && host.nextElementSibling === pageManager) return;
      // YouTube can create its page manager after our initial body fallback.
      pageManager.parentElement.insertBefore(host, pageManager);
    } else {
      if (host.isConnected) return;
      document.body.prepend(host);
    }
    syncLayout();
  }
  mount();
  const layoutObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(scheduleLayout) : null;
  for (const element of [document.querySelector('ytd-page-manager'), document.querySelector('ytd-masthead'), document.body]) if (element) layoutObserver?.observe(element);
  const themeObserver = new MutationObserver(scheduleLayout);
  themeObserver.observe(document.documentElement, {attributes:true,attributeFilter:['dark']});
  async function send(message) {
    try {
      const response = await chrome.runtime.sendMessage(message);
      if (!response || response.error) throw new Error(response?.error || 'Extension is unavailable. Reload this YouTube tab.');
      return response;
    } catch (error) { throw new Error(String(error?.message || 'Extension connection failed.').slice(0, 240)); }
  }
  let toastTimer;
  function toast(message) {
    $('.toast').textContent = message; $('.toast').hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('.toast').hidden = true; }, 4500);
  }
  function ready() { return state.active && state.hasKey && !!state.goal.trim() && !lastError && !mutationPending; }
  function render() {
    if (!draftDirty) $('#goal').value = state.goal;
    $('#pause').textContent = state.active ? 'Pause filtering' : 'Resume filtering';
    $('#pause').setAttribute('aria-pressed', String(!state.active));
    $('#pause').disabled = !state.goal.trim() || mutationPending || !state.hasKey;
    $('#set-goal').disabled = mutationPending;
    const currentVideo = videoURL(location.href);
    const isSaved = !!currentVideo && state.saved.some(video => video.id === currentVideo.id);
    $('#save-video').hidden = !currentVideo;
    $('#save-video').textContent = isSaved ? 'Video saved' : 'Save video';
    $('#save-video').title = isSaved ? 'Click to remove this video from Saved videos' : 'Save this video and its playback position';
    $('#save-video').setAttribute('aria-pressed', String(isSaved));
    $('#tangents').textContent = showTangents ? 'Hide off-topic' : 'Show off-topic';
    $('#tangents').setAttribute('aria-pressed', String(showTangents));
    $('#saved').textContent = `Saved videos${Array.isArray(state.saved) && state.saved.length ? ` (${state.saved.length})` : ''}`;
    let status;
    if (lastError) status = `${lastError} Original videos are visible.`;
    else if (!state.hasKey) status = 'Add your OpenRouter key in Settings. Original videos stay visible.';
    else if (!state.goal.trim()) status = 'Set a specific problem. Filtering uses video metadata, not verified answers.';
    else if (draftDirty && $('#goal').value.trim() !== state.goal) status = 'Goal edited. Choose Set goal to apply it.';
    else if (!state.active) status = 'Filtering paused. All videos are visible. Resume when you are ready.';
    else if (mutationPending) status = 'Updating your session…';
    else if (pending) status = `Checking ${pending} videos against your goal…`;
    else status = showTangents ? 'Filtering on. Off-topic videos are shown for now.' : 'Filtering on. Videos outside your goal are hidden unless you reveal them.';
    $('#status-text').textContent = status;
    $('.status').classList.toggle('error', !!lastError);
    $('#retry').hidden = !lastError;
    renderReminder();
  }
  function reminderContext() {
    const url = new URL(location.href), parsed = url.pathname === '/watch' ? videoURL(url.href) : null;
    const player = parsed ? document.querySelector('ytd-watch-flexy:not([hidden]) video, #movie_player video') : null;
    const result = currentWatch && parsed && currentWatch.id === parsed.id ? currentWatch.result : null;
    const kind = parsed && reminderSession?.isRelevant(parsed.id) ? 'relevant'
      : result && ['direct', 'background'].includes(result.label) ? 'relevant'
      : shouldCollapse(result, false, false) ? 'offTopic' : 'uncertain';
    return {watchId:parsed?.id || null, page:parsed ? 'watch' : url.pathname === '/' || url.pathname === '/results' || url.pathname.startsWith('/feed/') ? 'feed' : 'other', kind,
      enabled:ready() && !!reminderSession, visible:!document.hidden, focused:document.hasFocus(), playing:!!player && !player.paused && !player.ended && !document.querySelector('#movie_player.ad-showing'),
      fullscreen:!!document.fullscreenElement, minutes:state.reminderMinutes, player};
  }
  function renderReminder(show) {
    if (!reminderSession) { $('#reminder').hidden = true; $('#resume-reminders').hidden = true; return; }
    const context = reminderContext();
    if (show !== undefined) $('#reminder').hidden = !show;
    if (!context.enabled || !context.visible || !context.focused || context.fullscreen || (context.page !== 'feed' && context.kind !== 'offTopic')) $('#reminder').hidden = true;
    const message = `You came here to ${state.goal}. Still working on that?`;
    if ($('#reminder-text').textContent !== message) $('#reminder-text').textContent = message;
    $('#video-helps').hidden = context.page !== 'watch';
    $('#resume-reminders').hidden = !reminderSession.snapshot().dismissed || !state.goal;
  }
  function persistReminder(force = false) {
    if (!reminderSession || !state.goal || (!force && Date.now() - lastPersistAt < 5000)) return;
    const session = reminderSession.snapshot(), serialized = JSON.stringify(session);
    if (serialized === persistedReminder) return;
    lastPersistAt = Date.now(); persistedReminder = serialized;
    const message = {type:'SAVE_REMINDER_SESSION', goal:state.goal, reminderGeneration:state.reminderGeneration || 0, session};
    // Dispatch immediately, especially on pagehide. The background serializes
    // writes, so unloading never has to wait for an earlier response here.
    send(message).catch(() => { if (reminderSessionKey === JSON.stringify([message.goal, message.reminderGeneration])) persistedReminder = ''; });
  }
  function invalidateWatch() { watchRevision++; currentWatch = null; }
  async function ensureReminderSession() {
    const key = JSON.stringify([state.goal, state.reminderGeneration || 0]);
    if (key === reminderSessionKey || !globalThis.OnPurposeReminders) return;
    reminderSessionKey = key; reminderSession = null; invalidateWatch(); persistedReminder = ''; lastPersistAt = 0;
    const load = ++reminderLoad;
    renderReminder();
    if (!state.goal) return;
    let saved = {};
    try { saved = (await send({type:'GET_REMINDER_SESSION',goal:state.goal,reminderGeneration:state.reminderGeneration || 0})).session || {}; } catch { /* Filtering still works if session storage is temporarily unavailable. */ }
    if (load !== reminderLoad || destroyed) return;
    reminderSession = globalThis.OnPurposeReminders.createSession(saved);
    persistedReminder = JSON.stringify(reminderSession.snapshot());
    reminderTick(); scheduleScan();
  }
  function readCurrentMetadata() {
    if (navigating) return null;
    const parsed = new URL(location.href).pathname === '/watch' ? videoURL(location.href) : null;
    if (!parsed) return null;
    // YouTube leaves the previous video's DOM in place during SPA navigation.
    // Its watch renderer must explicitly identify the current URL before use.
    const watch = [...document.querySelectorAll('ytd-watch-flexy[video-id]')].find(node => !node.hasAttribute('hidden') && node.getAttribute('video-id') === parsed.id);
    const metadata = watch?.querySelector('ytd-watch-metadata');
    const title = text(metadata?.querySelector('h1'));
    if (!title) return null;
    const channel = text(metadata.querySelector('ytd-video-owner-renderer #channel-name, #owner #channel-name, #channel-name'));
    const description = text(metadata.querySelector('#description-inline-expander, #description yt-attributed-string, #description-text'));
    return {...parsed,title:title.slice(0,600),channel:channel.slice(0,200),description:description.slice(0,1800)};
  }
  function effectiveDecision(video, result) {
    return reminderSession?.isRelevant(video.id) ? {label:'direct',confidence:1,tangentProbability:0,collapseProbability:0} : result;
  }
  async function classifyCurrent(video, key) {
    const revision = watchRevision, requestEpoch = epoch, goal = state.goal;
    currentWatch.requested = true;
    try {
      const response = await send({type:'CLASSIFY',goal,videos:[video]});
      if (destroyed || revision !== watchRevision || epoch !== requestEpoch || goal !== state.goal || currentWatch?.key !== key || !ready()) return;
      const result = response.results?.find(item => item.id === video.id && LABELS.has(item.label) && Number.isFinite(item.confidence) && item.confidence >= 0 && item.confidence <= 1);
      if (!result) return;
      decisions.set(key, result); currentWatch.result = result;
      while (decisions.size > MAX_LOCAL_CACHE) decisions.delete(decisions.keys().next().value);
      reminderTick();
    } catch { /* Uncertain current videos never start the clock or interrupt filtering. */ }
  }
  function reminderTick(naturalBreak = false) {
    if (destroyed) return;
    if (location.href !== watchedURL) { persistReminder(true); watchedURL = location.href; invalidateWatch(); }
    if (!reminderSession) { renderReminder(); return; }
    const now = Date.now();
    if (ready()) {
      const video = readCurrentMetadata();
      if (!video) { if (currentWatch) invalidateWatch(); }
      else {
        const key = metadataKey(state.goal, video);
        if (key !== currentWatch?.key) { invalidateWatch(); currentWatch = {...video,key,since:now,result:null,requested:false}; }
        if (now - currentWatch.since >= 600) {
          const cached = effectiveDecision(video, decisions.get(key));
          if (cached) currentWatch.result = cached;
          else if (!currentWatch.requested && !inflight.has(key)) classifyCurrent(video,key);
        }
      }
    }
    const context = reminderContext();
    const result = reminderSession.advance(now, context, naturalBreak);
    if (context.kind === 'relevant' && currentWatch) reminderSession.rememberRelevant({id:currentWatch.id,title:currentWatch.title,url:currentWatch.url,timestamp:Math.max(0,Math.floor(context.player?.currentTime || 0))});
    renderReminder(result.show); persistReminder();
  }
  $('#video-helps').addEventListener('click', () => {
    const context = reminderContext();
    if (!reminderSession || !context.watchId || context.kind !== 'offTopic') return;
    reminderSession.markRelevant(context.watchId); reminderTick(); persistReminder(true); scheduleScan();
  });
  $('#keep-exploring').addEventListener('click', () => { reminderSession?.dismiss(); reminderTick(); persistReminder(true); });
  $('#resume-reminders').addEventListener('click', () => { reminderSession?.resume(); reminderTick(); persistReminder(true); });
  $('#back-to-goal').addEventListener('click', () => {
    if (!reminderSession) return;
    const useful = reminderSession.snapshot().lastRelevant;
    reminderSession.resume(); showTangents = false;
    for (const record of records.values()) record.revealed = false;
    restoreAll(); reminderTick(); persistReminder(true); render(); scheduleScan();
    const destination = useful ? new URL(`https://www.youtube.com/watch?v=${encodeURIComponent(useful.id)}`) : new URL('https://www.youtube.com/results');
    if (useful) { if (useful.timestamp > 0) destination.searchParams.set('t', `${Math.floor(useful.timestamp)}s`); }
    else destination.searchParams.set('search_query', state.goal);
    location.assign(destination.href);
  });
  function restoreRecord(record) {
    record.card.classList.remove('onpurpose-collapsed');
    record.placeholder?.remove(); record.placeholder = null;
    record.badge?.remove(); record.badge = null;
  }
  function restoreAll() { for (const record of records.values()) restoreRecord(record); }
  function applyState(next) {
    if (!next || typeof next.goal !== 'string') return;
    const changed = next.goal !== state.goal || !!next.active !== !!state.active || !!next.hasKey !== !!state.hasKey || (next.reminderGeneration || 0) !== (state.reminderGeneration || 0);
    state = {...state, ...next};
    if (changed) { epoch++; invalidateWatch(); lastError = ''; cooldownUntil = 0; restoreAll(); for (const record of records.values()) record.revealed = false; }
    ensureReminderSession(); reminderTick(); render(); scheduleScan();
  }
  async function refreshState() {
    if (mutationPending) return;
    const mutationAtRead = mutationRevision, thisRead = ++readRevision;
    try {
      const next = await send({type: 'GET_STATE'});
      if (mutationAtRead !== mutationRevision || thisRead !== readRevision || mutationPending || destroyed) return;
      applyState(next);
    } catch (error) {
      if (mutationAtRead !== mutationRevision || thisRead !== readRevision || mutationPending || destroyed) return;
      lastError = error.message; restoreAll(); render();
    }
  }
  async function mutate(message) {
    // Even an identical goal changes the backend session revision. Invalidate old
    // classifications before sending the mutation, not after comparing states.
    const thisMutation = ++mutationRevision, submittedDraft = draftRevision;
    reminderTick(); persistReminder(true);
    epoch++; readRevision++; mutationPending = true; lastError = ''; cooldownUntil = 0;
    invalidateWatch(); reminderSession?.resetClock();
    if (message.type === 'SET_GOAL') { reminderLoad++; reminderSessionKey = ''; reminderSession = null; }
    restoreAll(); render();
    try {
      const next = await send(message);
      if (thisMutation !== mutationRevision || destroyed) return;
      mutationPending = false;
      if (message.type === 'SET_GOAL' && draftRevision === submittedDraft) draftDirty = false;
      if (typeof next.goal === 'string') applyState(next); else await refreshState();
    } catch (error) {
      if (thisMutation !== mutationRevision || destroyed) return;
      mutationPending = false; lastError = error.message; restoreAll(); render();
    }
  }
  $('#goal').addEventListener('input', () => { draftDirty = true; draftRevision++; render(); });
  $('.goal-form').addEventListener('submit', event => {
    event.preventDefault(); const goal = $('#goal').value.trim();
    if (!goal) { toast('Describe the problem you came here to solve.'); return; }
    draftDirty = true;
    mutate({type: 'SET_GOAL', goal});
  });
  $('#pause').addEventListener('click', () => mutate({type: 'SET_ACTIVE', active: !state.active}));
  $('#tangents').addEventListener('click', () => {
    showTangents = !showTangents;
    if (!showTangents) for (const record of records.values()) record.revealed = false;
    render(); scheduleScan();
  });
  const openSettings = () => send({type: 'OPEN_SETTINGS'}).catch(error => toast(error.message));
  $('#settings').addEventListener('click', openSettings);
  $('#saved').addEventListener('click', () => send({type:'OPEN_SAVED'}).catch(error => toast(error.message)));
  $('#save-video').addEventListener('click', async () => {
    const parsed = videoURL(location.href);
    if (!parsed) return;
    const alreadySaved = state.saved.some(video => video.id === parsed.id);
    const title = text(document.querySelector('ytd-watch-metadata h1, h1.ytd-watch-metadata')) || document.title.replace(/ - YouTube$/, '');
    const player = document.querySelector('video');
    try {
      const response = await send(alreadySaved ? {type:'REMOVE_SAVED', id:parsed.id} : {type:'SAVE_FOR_LATER', video:{...parsed,title,timestamp:Math.floor(player?.currentTime || 0)}});
      applyState(response);
      toast(alreadySaved ? 'Removed from Saved videos.' : 'Video and playback position saved. Filtering is unchanged.');
    } catch (error) { toast(error.message); }
  });
  $('#retry').addEventListener('click', () => { lastError = ''; cooldownUntil = 0; refreshState(); });

  function makeButton(label, handler) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); handler(); }); return button;
  }
  function paint(record, result) {
    restoreRecord(record);
    if (!ready() || !result || !LABELS.has(result.label)) return;
    const visibleLabel = displayLabel(result);
    if (shouldCollapse(result, showTangents, record.revealed)) {
      const placeholder = document.createElement('div'); placeholder.className = 'onpurpose-placeholder onpurpose-tangent';
      placeholder.setAttribute('role', 'group'); placeholder.setAttribute('aria-label', 'Video outside your current goal');
      const label = document.createElement('div'); label.className = 'onpurpose-placeholder-label';
      const heading = document.createElement('strong'); heading.textContent = 'Outside your goal';
      const title = document.createElement('span'); title.className = 'onpurpose-hidden-title'; title.textContent = record.video.title;
      label.append(heading, title);
      const save = makeButton(state.saved.some(video => video.id === record.video.id) ? 'Saved' : 'Save for later', async () => {
        const alreadySaved = state.saved.some(video => video.id === record.video.id);
        try {
          applyState(await send(alreadySaved ? {type:'REMOVE_SAVED',id:record.video.id} : {type:'SAVE_FOR_LATER',video:record.video}));
          toast(alreadySaved ? 'Removed from Saved videos.' : 'Saved for later. Open Saved videos to find it.');
          save.textContent = alreadySaved ? 'Save for later' : 'Saved';
          save.setAttribute('aria-pressed', String(!alreadySaved));
        } catch (error) { toast(error.message); }
      });
      save.setAttribute('aria-pressed', String(state.saved.some(video => video.id === record.video.id)));
      placeholder.append(label, makeButton('Reveal video', () => { record.revealed = true; paint(record, result); }), save);
      record.card.insertAdjacentElement('afterend', placeholder); record.placeholder = placeholder;
      record.card.classList.add('onpurpose-collapsed');
    } else {
      const badge = document.createElement('details'); badge.className = `onpurpose-badge onpurpose-${visibleLabel}`;
      const labels = {direct:'Relevant to your goal',background:'Useful background',tangent:'Outside your goal',unclear:'Relevance uncertain'};
      const explanations = {direct:'The title or description suggests help with your goal. The video itself has not been checked.',background:'This may explain a prerequisite or related skill. It may not solve the whole problem.',tangent:'The title or description points to a different task. You can still choose to watch it.',unclear:'The available title and description are not enough to judge. This video stays visible.'};
      const summary = document.createElement('summary'); summary.textContent = labels[visibleLabel];
      const help = document.createElement('p'); help.textContent = reminderSession?.isRelevant(record.video.id) ? 'You marked this video as helpful for your current goal.' : explanations[visibleLabel];
      badge.append(summary,help);
      badge.addEventListener('click', event => event.stopPropagation());
      // Modern watch recommendations arrange avatar, text and menu horizontally.
      // Put the label under the title rather than adding a fourth flex column.
      const metadata = record.card.querySelector('yt-lockup-metadata-view-model .ytLockupMetadataViewModelTextContainer')
        || record.card.querySelector('#meta, yt-lockup-metadata-view-model');
      (metadata && !metadata.closest('a') ? metadata : record.card).append(badge); record.badge = badge;
    }
  }
  function nearViewport(card) {
    // Collapsed cards have no box; retain their existing decisions without new requests.
    if (card.classList.contains('onpurpose-collapsed')) return false;
    const rect = card.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > -400 && rect.top < innerHeight + 1000;
  }
  function cards() {
    return getVideoCards(document);
  }
  function scheduleScan() { if (destroyed || scanTimer) return; scanTimer = setTimeout(() => { scanTimer = null; scan(); }, 300); }
  async function scan() {
    if (destroyed) return;
    mount(); scheduleLayout();
    for (const [card, record] of records) {
      if (!card.isConnected) { restoreRecord(record); records.delete(card); }
    }
    if (!ready()) { restoreAll(); return; }
    const queue = new Map();
    for (const card of cards()) {
      const video = extractVideo(card);
      if (!video) {
        const previous = records.get(card);
        if (previous) { restoreRecord(previous); records.delete(card); }
        continue;
      }
      const key = metadataKey(state.goal, video);
      let record = records.get(card);
      if (!record || record.key !== key) {
        if (record) restoreRecord(record);
        record = {card, video, key, revealed: false, applied: null}; records.set(card, record);
      }
      const result = effectiveDecision(video, decisions.get(key));
      const paintKey = result ? JSON.stringify([result, showTangents, record.revealed, state.saved.some(video => video.id === record.video.id)]) : null;
      const collapsed = shouldCollapse(result, showTangents, record.revealed);
      const intact = collapsed
        ? card.classList.contains('onpurpose-collapsed') && record.placeholder?.isConnected && record.placeholder.previousElementSibling === card
        : !card.classList.contains('onpurpose-collapsed') && record.badge?.isConnected && card.contains(record.badge);
      if (result && (record.applied !== paintKey || !intact)) {
        paint(record, result); record.applied = paintKey;
      }
      if (!result && !inflight.has(key) && nearViewport(card)) queue.set(video.id, {video, key});
    }
    if (busy || !queue.size || Date.now() < cooldownUntil) return;
    const batch = [...queue.values()].slice(0, 8), requestEpoch = epoch, goal = state.goal;
    busy = true; pending = batch.length; batch.forEach(item => inflight.add(item.key)); render();
    try {
      const response = await send({type: 'CLASSIFY', goal, videos: batch.map(item => item.video)});
      if (epoch !== requestEpoch || state.goal !== goal || !ready()) return;
      if (!Array.isArray(response.results)) throw new Error('No valid decisions received.');
      let accepted = 0;
      for (const result of response.results) {
        const item = batch.find(entry => entry.video.id === result.id);
        if (!item || !LABELS.has(result.label) || !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) continue;
        const tangentProbability = Number.isFinite(result.tangentProbability) && result.tangentProbability >= 0 && result.tangentProbability <= 1 ? result.tangentProbability : 0;
        const collapseProbability = Number.isFinite(result.collapseProbability) && result.collapseProbability >= 0 && result.collapseProbability <= 1 ? result.collapseProbability : 0;
        decisions.set(item.key, {label: result.label, confidence: result.confidence, tangentProbability, collapseProbability}); accepted++;
      }
      if (accepted !== batch.length) throw new Error('Some video decisions were unavailable.');
      while (decisions.size > MAX_LOCAL_CACHE) decisions.delete(decisions.keys().next().value);
    } catch (error) {
      if (epoch === requestEpoch) { lastError = error.message; cooldownUntil = Date.now() + 30000; restoreAll(); }
    } finally {
      batch.forEach(item => inflight.delete(item.key)); busy = false; pending = 0; render(); scheduleScan();
    }
  }
  const observer = new MutationObserver(mutations => {
    // YouTube may replace a renderer's classes or remove our decorations while
    // retaining the same video. Compare final state so our own paints do not loop.
    const repairNeeded = ready() && mutations.some(m => {
      if (m.type === 'attributes' && m.attributeName === 'class') {
        const record = records.get(m.target);
        const result = record && effectiveDecision(record.video, decisions.get(record.key));
        return result && shouldCollapse(result, showTangents, record.revealed) !== m.target.classList.contains('onpurpose-collapsed');
      }
      if (m.type !== 'childList') return false;
      return [...m.removedNodes].some(node => node.nodeType === 1 && node.matches('.onpurpose-badge,.onpurpose-placeholder') && !node.isConnected && [...records.values()].some(record => record.badge === node || record.placeholder === node));
    });
    // Ignore our own badges and placeholders to avoid self-triggering scan loops.
    if (repairNeeded || mutations.some(m => !(m.type === 'attributes' && m.attributeName === 'class') && !host.contains(m.target) && !m.target.parentElement?.closest?.('.onpurpose-placeholder,.onpurpose-badge') && !m.target.closest?.('.onpurpose-placeholder,.onpurpose-badge') && (m.type !== 'childList' || [...m.addedNodes, ...m.removedNodes].some(n => n.nodeType !== 1 || !n.className?.toString().startsWith('onpurpose-'))))) scheduleScan();
  });
  const observePage = () => observer.observe(document.body, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['href', 'title', 'class']});
  observePage();
  window.addEventListener('scroll', scheduleScan, {passive: true});
  window.addEventListener('resize', () => {scheduleScan(); scheduleLayout();}, {passive:true});
  document.addEventListener('yt-navigate-start', () => { reminderTick(); persistReminder(true); navigating = true; invalidateWatch(); });
  document.addEventListener('yt-navigate-finish', () => { navigating = false; scheduleLayout(); epoch++; invalidateWatch(); reminderTick(); persistReminder(true); restoreAll(); scheduleScan(); refreshState(); });
  window.addEventListener('focus', () => { reminderTick(); clearTimeout(refreshTimer); refreshTimer = setTimeout(refreshState, 100); });
  window.addEventListener('blur', () => { reminderTick(); reminderSession?.resetClock(); persistReminder(true); });
  document.addEventListener('visibilitychange', () => { reminderTick(); reminderSession?.resetClock(); persistReminder(true); if (!document.hidden) refreshState(); });
  document.addEventListener('fullscreenchange', () => { host.style.display = document.fullscreenElement ? 'none' : ''; reminderTick(); });
  for (const event of ['pause','ended','play']) document.addEventListener(event, event => {
    if (event.target === reminderContext().player) reminderTick(event.type !== 'play');
  }, true);
  const startReminderTimer = () => { clearInterval(reminderTimer); reminderTimer = setInterval(reminderTick, 1000); };
  startReminderTimer();
  window.addEventListener('pagehide', () => {
    reminderTick(); persistReminder(true); reminderSession?.resetClock(); clearInterval(reminderTimer); reminderLoad++;
    destroyed = true; epoch++; mutationRevision++; readRevision++; mutationPending = false; observer.disconnect(); clearTimeout(scanTimer); scanTimer = null; clearTimeout(refreshTimer); restoreAll();
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    destroyed = false; reminderSession?.resetClock(); if (!reminderSession) reminderSessionKey = ''; invalidateWatch(); startReminderTimer(); observePage(); refreshState(); scheduleScan();
  });
  chrome.runtime.onMessage?.addListener((message, sender, sendResponse) => {
    if (sender.id !== chrome.runtime.id || message?.type !== 'STATE_CHANGED') return;
    // A toolbar submission can change the session revision even for the same goal.
    epoch++; invalidateWatch(); lastError = ''; cooldownUntil = 0;
    refreshState();
    sendResponse({ok: true});
  });
  refreshState();
})();

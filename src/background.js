import { encryptedStorage } from './storage.js';
import { buildRequest, parseDecision, MODEL, RUBRIC_VERSION, ENDPOINT } from './jev.js';

const MAX_VIDEOS = 40;
const MAX_CACHE = 600;
const CONCURRENCY = 3;
const YOUTUBE_ORIGIN = 'https://www.youtube.com';
const DEFAULT_USAGE = { requests: 0, inputTokens: 0, outputTokens: 0, cost: 0 };

function youtubeURL(value) {
  try { return new URL(value).origin === YOUTUBE_ORIGIN; } catch { return false; }
}
function normalizeVideo(video) {
  if (!video || typeof video.id !== 'string' || !/^[\w-]{1,100}$/.test(video.id) ||
      typeof video.title !== 'string' || !video.title.trim()) throw new Error('Invalid video metadata.');
  if (!youtubeURL(video.url)) throw new Error('Only YouTube video links are supported.');
  const url = new URL(video.url);
  let timestamp;
  if (video.timestamp !== undefined) {
    if (typeof video.timestamp !== 'number' || !Number.isFinite(video.timestamp) || video.timestamp < 0 || video.timestamp > Number.MAX_SAFE_INTEGER) throw new Error('Invalid video timestamp.');
    timestamp = Math.floor(video.timestamp);
    url.searchParams.set('t', String(timestamp));
  }
  return {
    id: video.id,
    title: video.title.slice(0, 1000),
    channel: String(video.channel || '').slice(0, 300),
    description: String(video.description || '').slice(0, 3000),
    url: url.href.slice(0, 2000),
    ...(timestamp === undefined ? {} : { timestamp }),
  };
}
function number(value) { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0; }

/** Dependencies are injectable so tests never need a real account or network. */
export function createController(chromeAPI, fetchAPI = globalThis.fetch, storage = chromeAPI.storage.local) {
  let state = { key: '', goal: '', active: false, saved: [], usage: { ...DEFAULT_USAGE } };
  let revision = 0;
  let keyRevision = 0;
  let mutation = Promise.resolve();
  const cache = new Map();
  const inFlight = new Map();
  const queue = [];
  let running = 0;
  const ready = (async () => {
    await storage.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    const stored = await storage.get(['key', 'goal', 'active', 'saved', 'usage']);
    state = {
      key: typeof stored.key === 'string' ? stored.key : '',
      goal: typeof stored.goal === 'string' ? stored.goal.slice(0, 1000) : '',
      active: stored.active === true,
      saved: Array.isArray(stored.saved) ? stored.saved.slice(-200) : [],
      usage: Object.fromEntries(Object.keys(DEFAULT_USAGE).map(k => [k, number(stored.usage?.[k])])),
    };
  })();
  function publicState() {
    return { goal: state.goal, active: state.active, hasKey: Boolean(state.key), saved: state.saved.map(v => ({ ...v })), usage: { ...state.usage } };
  }
  function trustedOptions(sender) {
    return sender?.id === chromeAPI.runtime.id && sender?.url === chromeAPI.runtime.getURL('src/options.html');
  }
  function trustedPopup(sender) {
    return sender?.id === chromeAPI.runtime.id && sender?.url === chromeAPI.runtime.getURL('src/popup.html');
  }
  function trustedSaved(sender) {
    return sender?.id === chromeAPI.runtime.id && sender?.url === chromeAPI.runtime.getURL('src/saved.html');
  }
  function permitted(sender) {
    return trustedOptions(sender) || trustedPopup(sender) || trustedSaved(sender) || (sender?.id === chromeAPI.runtime.id && youtubeURL(sender?.url) && youtubeURL(sender?.tab?.url));
  }
  function serialize(fn) {
    const result = mutation.then(fn);
    mutation = result.catch(() => {});
    return result;
  }
  async function openSaved() {
    const url = chromeAPI.runtime.getURL('src/saved.html');
    if (!chromeAPI.tabs?.create) throw new Error('Saved videos could not be opened. Try again.');
    let existing = [];
    try { existing = await chromeAPI.tabs.query({ url }); } catch { /* Opening the fixed local page still works if querying is unavailable. */ }
    for (const candidate of existing) {
      if (!Number.isInteger(candidate.id) || candidate.url !== url) continue;
      let tab;
      try { tab = await chromeAPI.tabs.get(candidate.id); } catch { continue; }
      if (tab.url !== url) continue;
      await chromeAPI.tabs.update(tab.id, { active: true });
      if (Number.isInteger(tab.windowId) && chromeAPI.windows?.update) await chromeAPI.windows.update(tab.windowId, { focused: true });
      return { ok: true, opened: false };
    }
    await chromeAPI.tabs.create({ url, active: true });
    return { ok: true, opened: true };
  }
  async function youtubeTabs() {
    if (!chromeAPI.tabs?.query) return [];
    const tabs = await chromeAPI.tabs.query({ url: 'https://www.youtube.com/*' });
    return tabs.filter(tab => Number.isInteger(tab.id) && youtubeURL(tab.url));
  }
  async function notifyYouTubeTabs() {
    try {
      const tabs = await youtubeTabs();
      await Promise.allSettled(tabs.map(tab => chromeAPI.tabs.sendMessage(tab.id, { type: 'STATE_CHANGED' })));
    } catch { /* Existing or pre-install tabs can be refreshed by the user. */ }
  }
  async function preferredYouTubeTab() {
    if (!chromeAPI.tabs?.query) return null;
    const current = await chromeAPI.tabs.query({ url: 'https://www.youtube.com/*', currentWindow: true });
    const candidates = current.filter(tab => Number.isInteger(tab.id) && youtubeURL(tab.url));
    const tabs = candidates.length ? candidates : await youtubeTabs();
    return tabs.find(tab => tab.active) || tabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0))[0] || null;
  }
  async function contentIsReady(tab) {
    try { return (await chromeAPI.tabs.sendMessage(tab.id, { type: 'STATE_CHANGED' }))?.ok === true; }
    catch { return false; }
  }
  async function youtubeContext() {
    const tab = await preferredYouTubeTab();
    return tab ? { hasTab: true, ready: await contentIsReady(tab) } : { hasTab: false, ready: false };
  }
  async function openYouTube(reload) {
    if (!chromeAPI.tabs?.create) throw new Error('Open or refresh YouTube manually to apply your goal.');
    let tab = await preferredYouTubeTab();
    if (tab) {
      // Recheck the origin before acting on a tab that could have navigated since the query.
      try { tab = await chromeAPI.tabs.get(tab.id); } catch { tab = null; }
      if (tab && !youtubeURL(tab.url)) tab = null;
    }
    if (!tab) {
      await chromeAPI.tabs.create({ url: 'https://www.youtube.com/', active: true });
      return { opened: true, reloaded: false, needsReload: false };
    }
    if (reload) await chromeAPI.tabs.reload(tab.id);
    await chromeAPI.tabs.update(tab.id, { active: true });
    if (Number.isInteger(tab.windowId) && chromeAPI.windows?.update) await chromeAPI.windows.update(tab.windowId, { focused: true });
    return { opened: false, reloaded: reload, needsReload: reload ? false : !(await contentIsReady(tab)) };
  }
  async function write(patch) {
    await storage.set(patch);
    Object.assign(state, patch);
    if (['key', 'goal', 'active', 'saved'].some(field => Object.hasOwn(patch, field))) void notifyYouTubeTabs();
  }
  function limited(fn) {
    if (queue.length >= 120) return Promise.reject(new Error('Too many pending videos. Try again shortly.'));
    return new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); drain(); });
  }
  function drain() {
    while (running < CONCURRENCY && queue.length) {
      const job = queue.shift(); running++;
      Promise.resolve().then(job.fn).then(job.resolve, job.reject).finally(() => { running--; drain(); });
    }
  }
  async function classifyOne(goal, video, expectedRevision, expectedKeyRevision) {
    const cacheKey = JSON.stringify([MODEL, RUBRIC_VERSION, expectedKeyRevision, goal, video]);
    if (cache.has(cacheKey)) return { ...cache.get(cacheKey), cached: true };
    if (inFlight.has(cacheKey)) return inFlight.get(cacheKey);
    const promise = limited(async () => {
      if (revision !== expectedRevision || keyRevision !== expectedKeyRevision || !state.active || state.goal !== goal) throw new Error('Session changed. Please retry.');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      let payload;
      try {
        let response;
        try {
          response = await fetchAPI(ENDPOINT, {
            method: 'POST',
            headers: { Authorization: `Bearer ${state.key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(buildRequest(goal, video)),
            signal: controller.signal,
            credentials: 'omit',
            redirect: 'error',
            referrerPolicy: 'no-referrer',
          });
        } catch {
          throw new Error('OpenRouter could not be reached. Videos remain visible.');
        }
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) throw new Error('OpenRouter rejected the API key. Check settings.');
          if (response.status === 402) throw new Error('OpenRouter credit is unavailable. Check your account.');
          if (response.status === 429) throw new Error('OpenRouter rate limit reached. Try again shortly.');
          throw new Error('OpenRouter returned an error. Videos remain visible.');
        }
        try { payload = await response.json(); } catch { throw new Error('OpenRouter returned an invalid response.'); }
      } finally { clearTimeout(timer); }
      // Account for a completed request even if the session changed or parsing fails.
      await serialize(async () => {
        const usage = {
          requests: state.usage.requests + 1,
          inputTokens: state.usage.inputTokens + number(payload.usage?.input_tokens),
          outputTokens: state.usage.outputTokens + number(payload.usage?.output_tokens),
          cost: state.usage.cost + number(payload.usage?.cost),
        };
        await write({ usage });
      });
      const decision = { id: video.id, ...parseDecision(payload) };
      if (keyRevision === expectedKeyRevision) {
        cache.set(cacheKey, decision);
        if (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
      }
      return decision;
    });
    inFlight.set(cacheKey, promise);
    try { return await promise; } finally { inFlight.delete(cacheKey); }
  }
  async function handle(message, sender) {
    if (!permitted(sender)) return { error: 'This extension works only on YouTube.' };
    try {
      await ready;
      if (!message || typeof message.type !== 'string') throw new Error('Invalid request.');
      if (message.type === 'GET_STATE') return publicState();
      if (message.type === 'OPEN_SAVED') return await openSaved();
      if (message.type === 'GET_POPUP_STATE') {
        if (!trustedPopup(sender)) throw new Error('Popup access denied.');
        return { ...publicState(), youtube: await youtubeContext() };
      }
      if (message.type === 'OPEN_YOUTUBE') {
        if (!trustedPopup(sender)) throw new Error('Popup access denied.');
        return await openYouTube(message.reload === true);
      }
      if (message.type === 'OPEN_SETTINGS') { await chromeAPI.runtime.openOptionsPage(); return { ok: true }; }
      if (message.type === 'GET_SETTINGS') {
        if (!trustedOptions(sender)) throw new Error('Settings access denied.');
        return publicState();
      }
      if (message.type === 'SAVE_SETTINGS') {
        if (!trustedOptions(sender)) throw new Error('Settings access denied.');
        return await serialize(async () => {
          const key = message.removeKey === true ? '' : typeof message.key === 'string' ? message.key.trim() : '';
          if (!message.removeKey && (!key || key.length > 512 || /\s/.test(key))) throw new Error('Enter a valid OpenRouter API key.');
          await write({ key });
          keyRevision++; revision++; cache.clear();
          return publicState();
        });
      }
      if (message.type === 'SET_GOAL') return await serialize(async () => {
        if (typeof message.goal !== 'string' || message.goal.length > 1000) throw new Error('Keep the goal under 1,000 characters.');
        const goal = message.goal.trim();
        await write({ goal, active: Boolean(goal) });
        revision++;
        return publicState();
      });
      if (message.type === 'SET_ACTIVE') return await serialize(async () => {
        if (typeof message.active !== 'boolean') throw new Error('Invalid pause setting.');
        await write({ active: message.active && Boolean(state.goal) });
        revision++;
        return publicState();
      });
      if (message.type === 'REMOVE_SAVED') return await serialize(async () => {
        if (typeof message.id !== 'string' || !/^[\w-]{1,100}$/.test(message.id)) throw new Error('Invalid saved video ID.');
        if (!state.saved.some(video => video.id === message.id)) throw new Error('This video is no longer saved.');
        await write({ saved: state.saved.filter(video => video.id !== message.id) });
        return publicState();
      });
      if (message.type === 'SAVE_FOR_LATER' || message.type === 'FINISH_SESSION') return await serialize(async () => {
        const patch = {};
        if (message.video) {
          const video = normalizeVideo(message.video);
          patch.saved = [...state.saved.filter(v => v.id !== video.id), { ...video, goal: state.goal, savedAt: new Date().toISOString() }].slice(-200);
        } else if (message.type === 'SAVE_FOR_LATER') throw new Error('Choose a video to save.');
        if (message.type === 'FINISH_SESSION') patch.active = false;
        await write(patch);
        if (message.type === 'FINISH_SESSION') revision++;
        return publicState();
      });
      if (message.type === 'CLASSIFY') {
        if (!state.key) throw new Error('Add your OpenRouter API key in settings.');
        if (!state.active || !state.goal) throw new Error('Filtering is paused.');
        if (message.goal !== state.goal) throw new Error('Goal changed. Please retry.');
        if (!Array.isArray(message.videos) || !message.videos.length || message.videos.length > MAX_VIDEOS) throw new Error('Request between 1 and 40 videos.');
        const videos = message.videos.map(normalizeVideo);
        if (new Set(videos.map(v => v.id)).size !== videos.length) throw new Error('Duplicate video IDs in request.');
        const expectedRevision = revision;
        const expectedKeyRevision = keyRevision;
        const results = await Promise.all(videos.map(video => classifyOne(state.goal, video, expectedRevision, expectedKeyRevision)));
        if (revision !== expectedRevision) throw new Error('Session changed. Videos remain visible.');
        return { results };
      }
      throw new Error('Unsupported request.');
    } catch (error) {
      // Never return response bodies, request headers, credentials or arbitrary errors.
      const safe = typeof error?.message === 'string' && !error.message.includes(state.key || '\0') ? error.message : 'Request failed. Videos remain visible.';
      return { error: safe, results: [] };
    }
  }
  return { handle, ready };
}

if (globalThis.chrome?.runtime?.onMessage && globalThis.chrome?.storage?.local) {
  const controller = createController(chrome, globalThis.fetch, encryptedStorage(chrome.storage.local));
  controller.ready.catch(() => {});
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    controller.handle(message, sender).then(sendResponse, () => sendResponse({ error: 'Request failed. Videos remain visible.' }));
    return true;
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { createController } from '../src/background.js';

const youtubeSender = { id: 'test-extension', url: 'https://www.youtube.com/results?search_query=test', tab: { url: 'https://www.youtube.com/results?search_query=test' } };
const settingsSender = { id: 'test-extension', url: 'chrome-extension://test-extension/src/options.html' };
const video = id => ({ id, title: `Video ${id}`, channel: 'Tutorial', url: `https://www.youtube.com/watch?v=${id}` });
const answer = () => ({ ok: true, json: async () => ({ answers: { relevance: { choice: 'tangent', confidence: .95 } }, usage: { cost: .00001, input_tokens: 100, output_tokens: 1 } }) });
function setup(fetchAPI = async () => answer(), initial = {}, addons = {}) {
  const data = { key: 'test-key-not-a-real-secret', goal: 'Fix a bug', active: true, ...initial };
  const access = [];
  const chromeAPI = {
    runtime: { id: 'test-extension', getURL: path => `chrome-extension://test-extension/${path}`, openOptionsPage: async () => {} },
    storage: { local: { setAccessLevel: async value => { access.push(value); }, get: async () => ({ ...data }), set: async patch => { Object.assign(data, patch); } } },
    ...addons,
  };
  return { ...createController(chromeAPI, fetchAPI), data, access };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const request = videos => ({ type: 'CLASSIFY', goal: 'Fix a bug', videos });

test('storage access restricted before reading; public state never exposes key', async () => {
  const instance = setup();
  const state = await instance.handle({ type: 'GET_STATE' }, youtubeSender);
  assert.deepEqual(instance.access, [{ accessLevel: 'TRUSTED_CONTEXTS' }]);
  assert.equal(state.hasKey, true);
  assert.equal('key' in state, false);
  assert.equal(JSON.stringify(state).includes(instance.data.key), false);
});
test('rejects foreign origins, missing tabs, spoofed subdomains and settings writes from YouTube', async () => {
  const instance = setup();
  for (const sender of [
    { ...youtubeSender, url: 'https://www.youtube.com.evil.test/' },
    { ...youtubeSender, id: 'other' },
    { ...youtubeSender, tab: undefined },
    { ...youtubeSender, tab: { url: 'https://example.com/' } },
    { ...youtubeSender, url: 'http://www.youtube.com/' },
  ]) assert.match((await instance.handle({ type: 'GET_STATE' }, sender)).error, /only on YouTube/);
  assert.match((await instance.handle({ type: 'SAVE_SETTINGS', key: 'new-secret' }, youtubeSender)).error, /denied/);
  assert.equal(instance.data.key, 'test-key-not-a-real-secret');
});
test('settings key save and removal return only sanitized state', async () => {
  const instance = setup();
  const response = await instance.handle({ type: 'SAVE_SETTINGS', key: ' replacement-key ' }, settingsSender);
  assert.equal(instance.data.key, 'replacement-key');
  assert.equal(response.hasKey, true);
  assert.equal('key' in response, false);
  assert.equal((await instance.handle({ type: 'SAVE_SETTINGS', removeKey: true }, settingsSender)).hasKey, false);
  assert.match((await instance.handle(request([video('a')]), youtubeSender)).error, /API key/);
});
test('fetch uses only backend credential; duplicate in-flight metadata and cached decisions reuse calls', async () => {
  let resolveFetch; let count = 0; let seenOptions;
  const instance = setup(async (_url, options) => { count++; seenOptions = options; return new Promise(resolve => { resolveFetch = resolve; }); });
  const first = instance.handle(request([video('a')]), youtubeSender);
  const second = instance.handle(request([video('a')]), youtubeSender);
  await tick();
  assert.equal(count, 1);
  assert.equal(seenOptions.credentials, 'omit');
  assert.equal(seenOptions.redirect, 'error');
  assert.match(seenOptions.headers.Authorization, /^Bearer /);
  resolveFetch(answer());
  assert.deepEqual(await first, await second);
  assert.equal((await instance.handle(request([video('a')]), youtubeSender)).results[0].cached, true);
  assert.equal(count, 1);
  const state = await instance.handle({ type: 'GET_STATE' }, youtubeSender);
  assert.equal(state.usage.requests, 1);
  assert.equal(state.usage.cost, .00001);
});
test('concurrency is bounded and a paused session discards late results', async () => {
  let running = 0; let max = 0; const releases = [];
  const instance = setup(async () => { running++; max = Math.max(max, running); await new Promise(resolve => releases.push(resolve)); running--; return answer(); });
  const result = instance.handle(request(['a', 'b', 'c', 'd', 'e'].map(video)), youtubeSender);
  await tick();
  assert.equal(max, 3);
  await instance.handle({ type: 'SET_ACTIVE', active: false }, youtubeSender);
  releases.forEach(resolve => resolve());
  assert.match((await result).error, /Session changed/);
  assert.equal(instance.data.active, false);
});
test('different full metadata is not a cache hit and mismatched goals never reach network', async () => {
  let count = 0;
  const instance = setup(async () => { count++; return answer(); });
  await instance.handle(request([video('a')]), youtubeSender);
  await instance.handle(request([{ ...video('a'), description: 'Changed description' }]), youtubeSender);
  assert.equal(count, 2);
  const changed = await instance.handle({ ...request([video('a')]), goal: 'Other goal' }, youtubeSender);
  assert.match(changed.error, /Goal changed/);
  assert.equal(count, 2);
});
test('API failure, invalid decisions and invalid links return no classifications', async () => {
  for (const response of [
    { ok: false, status: 401 },
    { ok: true, json: async () => ({ answers: { relevance: { choice: 'noul', confidence: .8 } } }) },
  ]) {
    const instance = setup(async () => response);
    const result = await instance.handle(request([video('a')]), youtubeSender);
    assert.ok(result.error); assert.deepEqual(result.results, []);
    assert.equal(JSON.stringify(result).includes(instance.data.key), false);
  }
  const instance = setup();
  assert.ok((await instance.handle(request([{ ...video('a'), url: 'javascript:alert(1)' }]), youtubeSender)).error);
});
test('finish saves video once, preserves timestamp link, and pauses', async () => {
  const instance = setup();
  const item = { ...video('a'), url: 'https://www.youtube.com/watch?v=a&t=30' };
  await instance.handle({ type: 'SAVE_FOR_LATER', video: item }, youtubeSender);
  const state = await instance.handle({ type: 'FINISH_SESSION', video: item }, youtubeSender);
  assert.equal(state.saved.length, 1);
  assert.equal(state.saved[0].url, item.url);
  assert.equal(state.active, false);
  assert.equal(state.goal, 'Fix a bug');
});


test('finish session saves the current timestamp in the reopened link', async () => {
  const instance = setup();
  const state = await instance.handle({ type: 'FINISH_SESSION', video: { ...video('a'), timestamp: 71.8 } }, youtubeSender);
  assert.equal(state.saved[0].timestamp, 71);
  assert.equal(new URL(state.saved[0].url).searchParams.get('t'), '71');
  assert.equal(state.active, false);
});
test('timestamps must be finite nonnegative numbers and zero is retained', async () => {
  const instance = setup();
  for (const timestamp of [-1, NaN, Infinity, '45', Number.MAX_SAFE_INTEGER + 1]) {
    const state = await instance.handle({ type: 'SAVE_FOR_LATER', video: { ...video('a'), timestamp } }, youtubeSender);
    assert.match(state.error, /timestamp/);
    assert.equal(instance.data.saved?.length || 0, 0);
  }
  const state = await instance.handle({ type: 'SAVE_FOR_LATER', video: { ...video('a'), timestamp: 0 } }, youtubeSender);
  assert.equal(state.saved[0].timestamp, 0);
  assert.equal(new URL(state.saved[0].url).searchParams.get('t'), '0');
});

const popupSender = { id: 'test-extension', url: 'chrome-extension://test-extension/src/popup.html' };
function tabAPIs(initialTabs = []) {
  const tabs = initialTabs.map(t => ({ ...t })), events = [];
  return { events, tabs, apis: { tabs: {
    query: async query => { events.push({ type: 'query', query }); return tabs.filter(t => t.url.startsWith('https://www.youtube.com/') && (!query.currentWindow || t.windowId === 1)); },
    get: async id => tabs.find(t => t.id === id),
    update: async (id, patch) => { events.push({ type: 'update', id, patch }); return tabs.find(t => t.id === id); },
    reload: async id => { events.push({ type: 'reload', id }); },
    create: async patch => { events.push({ type: 'create', patch }); return { id: 99, ...patch }; },
    sendMessage: async (id, message) => { events.push({ type: 'message', id, message }); if (!tabs.find(t => t.id === id)?.ready) throw new Error('No receiving end'); return { ok: true }; },
  }, windows: { update: async (id, patch) => { events.push({ type: 'window', id, patch }); } } } };
}
test('popup receives sanitized state and can control goals but cannot read or save credentials', async () => {
  const helper = tabAPIs([{ id: 1, windowId: 1, url: 'https://www.youtube.com/', ready: true }]);
  const instance = setup(undefined, {}, helper.apis);
  const state = await instance.handle({ type: 'GET_POPUP_STATE' }, popupSender);
  assert.equal(state.hasKey, true); assert.equal(state.youtube.ready, true); assert.equal('key' in state, false);
  assert.match((await instance.handle({ type: 'GET_SETTINGS' }, popupSender)).error, /denied/);
  assert.match((await instance.handle({ type: 'SAVE_SETTINGS', key: 'other' }, popupSender)).error, /denied/);
  assert.match((await instance.handle({ type: 'OPEN_YOUTUBE' }, youtubeSender)).error, /denied/);
  await instance.handle({ type: 'SET_GOAL', goal: 'New goal' }, popupSender); await tick();
  assert.ok(helper.events.some(e => e.type === 'message' && e.message.type === 'STATE_CHANGED'));
  assert.equal(JSON.stringify(helper.events).includes(instance.data.key), false);
  assert.ok(helper.events.filter(e => e.type === 'query').every(e => e.query.url === 'https://www.youtube.com/*'));
});
test('popup focuses existing YouTube and only reloads after explicit request', async () => {
  const helper = tabAPIs([{ id: 7, windowId: 1, url: 'https://www.youtube.com/watch?v=abc', ready: false }]);
  const instance = setup(undefined, {}, helper.apis);
  assert.equal((await instance.handle({ type: 'OPEN_YOUTUBE' }, popupSender)).needsReload, true);
  assert.equal(helper.events.filter(e => e.type === 'reload').length, 0);
  const result = await instance.handle({ type: 'OPEN_YOUTUBE', reload: true }, popupSender);
  assert.equal(result.reloaded, true); assert.equal(result.needsReload, false);
  assert.deepEqual(helper.events.filter(e => e.type === 'reload').map(e => e.id), [7]);
});
test('popup opens a new YouTube tab without changing other websites', async () => {
  const helper = tabAPIs([{ id: 8, windowId: 1, url: 'https://example.com/', ready: false }]);
  const instance = setup(undefined, {}, helper.apis);
  assert.equal((await instance.handle({ type: 'OPEN_YOUTUBE', reload: true }, popupSender)).opened, true);
  assert.equal(helper.events.some(e => ['update', 'reload'].includes(e.type)), false);
  assert.deepEqual(helper.events.find(e => e.type === 'create').patch, { url: 'https://www.youtube.com/', active: true });
});
test('a tab that navigates away after querying is not refreshed or reused', async () => {
  const helper = tabAPIs([{ id: 7, windowId: 1, url: 'https://www.youtube.com/', ready: false }]);
  helper.apis.tabs.get = async id => ({ id, url: 'https://example.com/' });
  const instance = setup(undefined, {}, helper.apis);
  assert.equal((await instance.handle({ type: 'OPEN_YOUTUBE', reload: true }, popupSender)).opened, true);
  assert.equal(helper.events.some(e => e.type === 'reload' || e.type === 'update'), false);
});

const savedSender = { id: 'test-extension', url: 'chrome-extension://test-extension/src/saved.html' };
test('saved page receives bookmarks without credentials and cannot access key settings', async () => {
  const instance = setup(undefined, { saved: [video('a')] });
  const state = await instance.handle({ type: 'GET_STATE' }, savedSender);
  assert.equal(state.saved[0].id, 'a'); assert.equal('key' in state, false);
  assert.match((await instance.handle({ type: 'GET_SETTINGS' }, savedSender)).error, /denied/);
  assert.match((await instance.handle({ type: 'SAVE_SETTINGS', key: 'other' }, savedSender)).error, /denied/);
});
test('removing a bookmark works from own YouTube and internal UI contexts', async () => {
  for (const sender of [youtubeSender, settingsSender, popupSender, savedSender]) {
    const instance = setup(undefined, { saved: [video('a'), video('b')] });
    const result = await instance.handle({ type: 'REMOVE_SAVED', id: 'a' }, sender);
    assert.deepEqual(result.saved.map(v => v.id), ['b']); assert.equal('key' in result, false);
    assert.equal(result.active, true);
    assert.match((await instance.handle({ type: 'REMOVE_SAVED', id: 'a' }, sender)).error, /no longer saved/);
    assert.match((await instance.handle({ type: 'REMOVE_SAVED', id: '../bad' }, sender)).error, /Invalid/);
  }
});
test('OPEN_SAVED ignores supplied URLs and opens only its dedicated local page', async () => {
  const helper = tabAPIs([]);
  const instance = setup(undefined, {}, helper.apis);
  const result = await instance.handle({ type: 'OPEN_SAVED', url: 'https://example.com/' }, youtubeSender);
  assert.equal(result.opened, true);
  assert.deepEqual(helper.events.find(e => e.type === 'create').patch, { url: 'chrome-extension://test-extension/src/saved.html', active: true });
});
test('OPEN_SAVED focuses an existing exact saved page and rechecks its URL', async () => {
  const helper = tabAPIs([]), savedURL = 'chrome-extension://test-extension/src/saved.html';
  helper.apis.tabs.query = async () => [{ id: 3, url: savedURL }];
  helper.apis.tabs.get = async () => ({ id: 3, windowId: 1, url: savedURL });
  const instance = setup(undefined, {}, helper.apis);
  assert.equal((await instance.handle({ type: 'OPEN_SAVED' }, popupSender)).opened, false);
  assert.equal(helper.events.find(e => e.type === 'update').id, 3);
  helper.events.length = 0;
  helper.apis.tabs.get = async () => ({ id: 3, url: 'https://example.com/' });
  assert.equal((await instance.handle({ type: 'OPEN_SAVED' }, savedSender)).opened, true);
  assert.equal(helper.events.some(e => e.type === 'update'), false);
});

test('reminder minutes default to ten, validate strictly, and do not change credentials or goals', async () => {
  for (const stored of [undefined, 0, -1, 1.5, '20', Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const instance = setup(undefined, { reminderMinutes: stored });
    assert.equal((await instance.handle({ type: 'GET_SETTINGS' }, settingsSender)).reminderMinutes, 10);
  }
  const instance = setup();
  for (const minutes of [0, -2, 1.5, '5', null, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.match((await instance.handle({ type: 'SAVE_REMINDER_SETTINGS', minutes }, settingsSender)).error, /whole number/);
  }
  assert.match((await instance.handle({ type: 'SAVE_REMINDER_SETTINGS', minutes: 5 }, youtubeSender)).error, /denied/);
  for (const minutes of [1, 5, 25, Number.MAX_SAFE_INTEGER]) {
    const state = await instance.handle({ type: 'SAVE_REMINDER_SETTINGS', minutes }, settingsSender);
    assert.equal(state.reminderMinutes, minutes);
    assert.equal(state.goal, 'Fix a bug');
    assert.equal(state.hasKey, true);
    assert.equal(instance.data.key, 'test-key-not-a-real-secret');
    assert.equal('key' in state, false);
  }
});

test('reminder session survives worker restart, is tab scoped and rejects stale goal generations', async () => {
  const data = { key: 'test-only', goal: 'Fix a bug', active: true }, sessionData = {}, access = [];
  const chromeAPI = {
    runtime: { id: 'test-extension', getURL: path => `chrome-extension://test-extension/${path}` },
    storage: {
      local: { setAccessLevel: async () => {}, get: async () => structuredClone(data), set: async patch => Object.assign(data, structuredClone(patch)) },
      session: { setAccessLevel: async value => access.push(value), get: async () => structuredClone(sessionData), set: async patch => Object.assign(sessionData, structuredClone(patch)) },
    },
  };
  let instance = createController(chromeAPI);
  const sender = { ...youtubeSender, tab: { ...youtubeSender.tab, id: 9 } };
  const session = { elapsedMs: 420000, dismissed: false, relevantIds: ['useful'], lastRelevant: { ...video('useful'), timestamp: 37 } };
  const base = { goal: 'Fix a bug', reminderGeneration: 0 };
  assert.deepEqual(await instance.handle({ ...base, type: 'SAVE_REMINDER_SESSION', session }, sender), { ok: true });
  assert.equal(data.reminderTabs, undefined);
  instance = createController(chromeAPI);
  let restored = await instance.handle({ ...base, type: 'GET_REMINDER_SESSION' }, sender);
  assert.equal(restored.session.elapsedMs, 420000);
  assert.match(restored.session.lastRelevant.url, /t=37/);
  assert.equal((await instance.handle({ ...base, type: 'GET_REMINDER_SESSION' }, { ...sender, tab: { ...sender.tab, id: 10 } })).session.elapsedMs, 0);
  assert.match((await instance.handle({ ...base, type: 'GET_REMINDER_SESSION' }, settingsSender)).error, /denied/);
  const reset = await instance.handle({ type: 'SET_GOAL', goal: 'Fix a bug' }, sender);
  assert.equal(reset.reminderGeneration, 1);
  assert.match((await instance.handle({ ...base, type: 'SAVE_REMINDER_SESSION', session }, sender)).error, /Goal changed/);
  assert.equal((await instance.handle({ ...base, reminderGeneration: 1, type: 'GET_REMINDER_SESSION' }, sender)).session.elapsedMs, 0);
  assert.ok(access.every(value => value.accessLevel === 'TRUSTED_CONTEXTS'));
});

test('reminder session validates safe return links and removes closed tab state', async () => {
  const instance = setup();
  const sender = { ...youtubeSender, tab: { ...youtubeSender.tab, id: 9 } };
  const base = { goal: 'Fix a bug', reminderGeneration: 0 };
  const session = { elapsedMs: 1000, dismissed: false, relevantIds: [], lastRelevant: null };
  for (const invalid of [
    { ...session, elapsedMs: -1 }, { ...session, elapsedMs: Infinity }, { ...session, dismissed: 'false' },
    { ...session, relevantIds: ['<script>'] }, { ...session, lastRelevant: { ...video('a'), url: 'https://www.youtube.com/logout' } },
    { ...session, lastRelevant: { ...video('a'), url: 'https://evil.test/watch?v=a' } },
  ]) assert.ok((await instance.handle({ ...base, type: 'SAVE_REMINDER_SESSION', session: invalid }, sender)).error);
  await instance.handle({ ...base, type: 'SAVE_REMINDER_SESSION', session }, sender);
  await instance.forgetTab(9);
  assert.equal((await instance.handle({ ...base, type: 'GET_REMINDER_SESSION' }, sender)).session.elapsedMs, 0);
});

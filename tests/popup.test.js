import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const html = await fs.readFile(new URL('../src/popup.html', import.meta.url), 'utf8');
const script = await fs.readFile(new URL('../src/popup.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function setup({ hasKey = true, youtube = { hasTab: true, ready: true }, error } = {}) {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const messages = []; let closed = 0;
  let state = { hasKey, goal: 'Fix hydration errors', active: true, saved: [], usage: { requests: 12, cost: .00123 }, youtube };
  dom.window.close = () => { closed++; };
  dom.window.chrome = { runtime: { sendMessage: async message => {
    messages.push(message);
    if (message.type === 'GET_POPUP_STATE') return state;
    if (error && message.type === 'SET_GOAL') return { error };
    if (message.type === 'SET_GOAL') state = { ...state, goal: message.goal, active: true };
    if (message.type === 'SET_ACTIVE') state = { ...state, active: message.active };
    if (message.type === 'OPEN_YOUTUBE') return { opened: !youtube.hasTab, reloaded: message.reload, needsReload: youtube.hasTab && !youtube.ready && !message.reload };
    return state;
  } } };
  dom.window.eval(script); await tick();
  return { dom, messages, document: dom.window.document, closed: () => closed };
}
test('first use without a key automatically opens settings', async () => {
  const env = await setup({ hasKey: false });
  assert.deepEqual(env.messages.map(m => m.type), ['GET_POPUP_STATE', 'OPEN_SETTINGS']);
  assert.equal(env.closed(), 1); assert.equal(env.document.querySelector('#session').hidden, true);
});
test('configured popup shows goal, reported cost and controls without redirecting to settings', async () => {
  const env = await setup();
  assert.equal(env.messages.some(m => m.type === 'OPEN_SETTINGS'), false);
  assert.equal(env.document.querySelector('#goal').value, 'Fix hydration errors');
  assert.match(env.document.querySelector('#usage').textContent, /12 recorded requests.*0.001230/);
  assert.equal(env.document.querySelector('#refresh-help').hidden, true);
  env.document.querySelector('#pause').click(); await tick();
  assert.equal(env.document.querySelector('#pause').textContent, 'Resume');
  assert.equal(env.messages.at(-1).active, false);
});
test('starting with an unconnected old YouTube tab explicitly refreshes it', async () => {
  const env = await setup({ youtube: { hasTab: true, ready: false } });
  assert.equal(env.document.querySelector('#start').textContent, 'Start and refresh YouTube');
  assert.equal(env.document.querySelector('#refresh-help').hidden, false);
  env.document.querySelector('#goal').value = 'Solve a different problem';
  env.document.querySelector('#goal-form').dispatchEvent(new env.dom.window.Event('submit', { cancelable: true })); await tick();
  assert.equal(env.messages.find(m => m.type === 'SET_GOAL').goal, 'Solve a different problem');
  assert.equal(env.messages.at(-1).type, 'OPEN_YOUTUBE'); assert.equal(env.messages.at(-1).reload, true);
});
test('outside YouTube the popup offers Open YouTube and no reload control', async () => {
  const env = await setup({ youtube: { hasTab: false, ready: false } });
  assert.equal(env.document.querySelector('#open-youtube').textContent, 'Open YouTube');
  assert.equal(env.document.querySelector('#refresh-help').hidden, true);
  env.document.querySelector('#open-youtube').click(); await tick();
  assert.equal(env.messages.at(-1).type, 'OPEN_YOUTUBE'); assert.equal(env.messages.at(-1).reload, false);
});
test('failed goal saves keep popup open and do not navigate or reload tabs', async () => {
  const env = await setup({ error: 'Storage is unavailable.' });
  env.document.querySelector('#goal-form').dispatchEvent(new env.dom.window.Event('submit', { cancelable: true })); await tick();
  assert.match(env.document.querySelector('#status').textContent, /Storage is unavailable/);
  assert.equal(env.messages.some(m => m.type === 'OPEN_YOUTUBE'), false);
  assert.equal(env.closed(), 0);
});
test('popup UI and manifest name contain no em dash', () => {
  assert.equal((html + script).includes('\u2014'), false);
});

test('Saved videos opens its dedicated page separately from settings', async () => {
  const env = await setup();
  env.document.querySelector('#saved').click(); await tick();
  assert.equal(env.messages.at(-1).type, 'OPEN_SAVED');
  assert.equal(env.messages.some(m => m.type === 'OPEN_SETTINGS'), false);
  assert.equal(env.closed(), 1);
});

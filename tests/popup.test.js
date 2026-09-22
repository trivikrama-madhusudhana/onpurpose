import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const html = await fs.readFile(new URL('../src/popup.html', import.meta.url), 'utf8');
const script = await fs.readFile(new URL('../src/popup.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
async function setup({ hasKey = true, enabled = true, active = true, youtube = { hasTab: true, ready: true }, error, toggleError, intercept } = {}) {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const messages = []; const listeners = []; let closed = 0;
  let state = { hasKey, enabled, goal: 'Fix hydration errors', active, saved: [{ id: 'saved-video' }], usage: { requests: 12, cost: .00123 }, youtube };
  dom.window.close = () => { closed++; };
  dom.window.chrome = { runtime: { id: 'test-extension', onMessage: { addListener: listener => listeners.push(listener) }, sendMessage: async message => {
    messages.push(message);
    const intercepted = intercept?.(message, state);
    if (intercepted !== undefined) return intercepted;
    if (message.type === 'GET_POPUP_STATE') return state;
    if (error && message.type === 'SET_GOAL') return { error };
    if (toggleError && message.type === 'SET_ENABLED') return { error: toggleError };
    if (message.type === 'SET_GOAL') state = { ...state, goal: message.goal, active: true };
    if (message.type === 'SET_ACTIVE') state = { ...state, active: message.active };
    if (message.type === 'SET_ENABLED') state = { ...state, enabled: message.enabled };
    if (message.type === 'OPEN_YOUTUBE') return { opened: !youtube.hasTab, reloaded: message.reload, needsReload: youtube.hasTab && !youtube.ready && !message.reload };
    return state;
  } } };
  dom.window.eval(script); await tick();
  return { dom, messages, document: dom.window.document, closed: () => closed, state: () => state,
    changeState: (patch, sender = { id: 'test-extension' }) => {
      state = { ...state, ...patch };
      for (const listener of listeners) listener({ type: 'STATE_CHANGED' }, sender, () => {});
    } };
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
test('popup UI contains no em or en dash', () => {
  assert.equal(/[\u2013\u2014]/.test(html + script), false);
});

test('master switch turns off and on without changing the saved session or navigating YouTube', async () => {
  const env = await setup({ active: false, youtube: { hasTab: true, ready: false } });
  const initial = env.state();
  const toggle = env.document.querySelector('#enabled');
  assert.equal(toggle.getAttribute('role'), 'switch');
  assert.equal(toggle.getAttribute('aria-checked'), 'true');
  toggle.click(); await tick();
  assert.equal(toggle.getAttribute('aria-checked'), 'false');
  assert.equal(env.document.querySelector('#power-value').textContent, 'Off');
  for (const selector of ['#goal', '#start', '#pause', '#refresh-youtube']) assert.equal(env.document.querySelector(selector).disabled, true);
  assert.equal(env.document.querySelector('#refresh-help').hidden, true);
  assert.deepEqual(env.state(), { ...initial, enabled: false });
  toggle.click(); await tick();
  assert.equal(toggle.getAttribute('aria-checked'), 'true');
  assert.equal(env.document.querySelector('#power-value').textContent, 'On');
  assert.equal(env.document.querySelector('#goal').disabled, false);
  assert.equal(env.document.querySelector('#pause').textContent, 'Resume');
  assert.deepEqual(env.state(), initial);
  assert.deepEqual(env.messages.map(message => message.type), ['GET_POPUP_STATE', 'SET_ENABLED', 'SET_ENABLED']);
  assert.equal(env.closed(), 0);
});

test('off popup without a key keeps the switch and saved/settings access available without onboarding', async () => {
  const env = await setup({ hasKey: false, enabled: false });
  assert.deepEqual(env.messages.map(message => message.type), ['GET_POPUP_STATE']);
  assert.equal(env.document.querySelector('#power').hidden, false);
  assert.equal(env.document.querySelector('#enabled').disabled, false);
  assert.equal(env.document.querySelector('#setup').hidden, true);
  assert.equal(env.document.querySelector('#session').hidden, true);
  assert.equal(env.closed(), 0);
  env.document.querySelector('#saved').click(); await tick();
  assert.equal(env.messages.at(-1).type, 'OPEN_SAVED');
  env.document.querySelector('#settings').click(); await tick();
  assert.equal(env.messages.at(-1).type, 'OPEN_SETTINGS');
});

test('turning on without a key guides the user to settings without opening YouTube', async () => {
  const env = await setup({ hasKey: false, enabled: false });
  env.document.querySelector('#enabled').click(); await tick();
  assert.deepEqual(env.messages.map(message => message.type), ['GET_POPUP_STATE', 'SET_ENABLED', 'OPEN_SETTINGS']);
  assert.equal(env.state().enabled, true);
  assert.equal(env.closed(), 1);
});

test('a failed power change keeps the prior switch value and leaves the popup open', async () => {
  const env = await setup({ toggleError: 'Storage is unavailable.' });
  const initial = env.state();
  env.document.querySelector('#enabled').click(); await tick();
  assert.equal(env.document.querySelector('#enabled').getAttribute('aria-checked'), 'true');
  assert.equal(env.document.querySelector('#enabled').disabled, false);
  assert.equal(env.document.querySelector('#goal').disabled, false);
  assert.match(env.document.querySelector('#status').textContent, /Storage is unavailable/);
  assert.equal(env.document.querySelector('#status').dataset.error, 'true');
  assert.deepEqual(env.state(), initial);
  assert.equal(env.closed(), 0);
  assert.equal(env.messages.some(message => message.type === 'OPEN_YOUTUBE'), false);
});

test('external On/Off changes refresh controls without losing an unfocused goal draft', async () => {
  const env = await setup();
  const goal = env.document.querySelector('#goal');
  goal.value = 'A draft I have not saved';
  goal.dispatchEvent(new env.dom.window.Event('input', { bubbles: true }));
  env.document.querySelector('#enabled').focus();
  env.changeState({ enabled: false }); await tick();
  assert.equal(env.document.querySelector('#enabled').getAttribute('aria-checked'), 'false');
  assert.equal(goal.value, 'A draft I have not saved');
  assert.equal(goal.disabled, true);
  env.changeState({ enabled: true, active: false }); await tick();
  assert.equal(env.document.querySelector('#enabled').getAttribute('aria-checked'), 'true');
  assert.equal(goal.value, 'A draft I have not saved');
  assert.equal(goal.disabled, false);
  assert.equal(env.document.querySelector('#pause').textContent, 'Resume');
  assert.equal(env.messages.some(message => message.type === 'SET_GOAL' || message.type === 'OPEN_YOUTUBE'), false);
});

test('external enable without a key waits for a settings click', async () => {
  const env = await setup({ enabled: false, hasKey: false });
  env.changeState({ enabled: true }); await tick();
  assert.equal(env.document.querySelector('#enabled').getAttribute('aria-checked'), 'true');
  assert.equal(env.document.querySelector('#setup').hidden, false);
  assert.equal(env.messages.some(message => message.type === 'OPEN_SETTINGS'), false);
});

test('choosing off does not open settings when an external enable overtakes its reply', async () => {
  let resolveToggle;
  let staleReply;
  const env = await setup({ enabled: false, hasKey: false, intercept: (message, state) => {
    if (message.type !== 'SET_ENABLED') return;
    staleReply = { ...state, enabled: message.enabled };
    return new Promise(resolve => { resolveToggle = resolve; });
  } });
  env.changeState({ enabled: true }); await tick();
  env.document.querySelector('#enabled').click();
  assert.equal(env.messages.at(-1).enabled, false);
  env.changeState({ enabled: true }); await tick();
  resolveToggle(staleReply); await tick();
  assert.equal(env.document.querySelector('#enabled').getAttribute('aria-checked'), 'true');
  assert.equal(env.document.querySelector('#setup').hidden, false);
  assert.equal(env.messages.some(message => message.type === 'OPEN_SETTINGS'), false);
  assert.equal(env.closed(), 0);
});

test('late action replies cannot overwrite an external off change or trigger YouTube navigation', async () => {
  let resolveGoal;
  let staleReply;
  const env = await setup({ intercept: (message, state) => {
    if (message.type !== 'SET_GOAL') return;
    staleReply = { ...state, goal: message.goal };
    return new Promise(resolve => { resolveGoal = resolve; });
  } });
  env.document.querySelector('#goal-form').dispatchEvent(new env.dom.window.Event('submit', { cancelable: true }));
  env.changeState({ enabled: false }); await tick();
  resolveGoal(staleReply); await tick();
  assert.equal(env.document.querySelector('#enabled').getAttribute('aria-checked'), 'false');
  assert.equal(env.document.querySelector('#goal').disabled, true);
  assert.equal(env.messages.some(message => message.type === 'OPEN_YOUTUBE'), false);
  assert.equal(env.closed(), 0);
});

test('a notification from the goal save still allows its intended YouTube navigation', async () => {
  let env;
  env = await setup({ intercept: (message, state) => {
    if (message.type !== 'SET_GOAL') return;
    const updated = { ...state, goal: message.goal, active: true };
    env.changeState(updated);
    return updated;
  } });
  const goal = env.document.querySelector('#goal');
  goal.value = 'Fix the new error';
  goal.dispatchEvent(new env.dom.window.Event('input', { bubbles: true }));
  env.document.querySelector('#goal-form').dispatchEvent(new env.dom.window.Event('submit', { cancelable: true })); await tick();
  assert.equal(env.state().goal, 'Fix the new error');
  assert.equal(env.messages.at(-1).type, 'OPEN_YOUTUBE');
  assert.equal(env.closed(), 1);
});

test('power switch stays busy until its save completes and ignores repeated clicks', async () => {
  let resolveToggle;
  const env = await setup({ intercept: (message, state) => {
    if (message.type !== 'SET_ENABLED') return;
    return new Promise(resolve => { resolveToggle = () => resolve({ ...state, enabled: message.enabled }); });
  } });
  const toggle = env.document.querySelector('#enabled');
  toggle.click(); toggle.click();
  assert.equal(toggle.disabled, true);
  assert.equal(env.messages.filter(message => message.type === 'SET_ENABLED').length, 1);
  resolveToggle(); await tick();
  assert.equal(toggle.disabled, false);
  assert.equal(toggle.getAttribute('aria-checked'), 'false');
});

test('off state ignores submitted goal forms', async () => {
  const env = await setup({ enabled: false });
  env.document.querySelector('#goal-form').dispatchEvent(new env.dom.window.Event('submit', { cancelable: true })); await tick();
  assert.deepEqual(env.messages.map(message => message.type), ['GET_POPUP_STATE']);
});

test('notifications from other extensions do not refresh state', async () => {
  const env = await setup();
  env.changeState({ enabled: false }, { id: 'other-extension' }); await tick();
  assert.equal(env.document.querySelector('#enabled').getAttribute('aria-checked'), 'true');
  assert.deepEqual(env.messages.map(message => message.type), ['GET_POPUP_STATE']);
});

test('Saved videos opens its dedicated page separately from settings', async () => {
  const env = await setup();
  env.document.querySelector('#saved').click(); await tick();
  assert.equal(env.messages.at(-1).type, 'OPEN_SAVED');
  assert.equal(env.messages.some(m => m.type === 'OPEN_SETTINGS'), false);
  assert.equal(env.closed(), 1);
});

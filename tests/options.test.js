import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const html = await readFile(new URL('../src/options.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../src/options.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

test('options never prefill a stored key and do not mix bookmarks into settings', async () => {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  dom.window.chrome = { runtime: { sendMessage: async () => ({ hasKey: true, saved: [{ title: '<img src=x onerror=alert(1)>', url: 'https://www.youtube.com/watch?v=a', goal: '<b>goal</b>' }, { title: 'Bad link', url: 'javascript:alert(1)' }], usage: {} }) } };
  dom.window.eval(script); await tick();
  assert.equal(dom.window.document.querySelector('#api-key').value, '');
  assert.match(dom.window.document.querySelector('#key-status').textContent, /A key is saved/);
  assert.equal(dom.window.document.querySelector('#ready').hidden, false);
  assert.equal(dom.window.document.querySelector('#saved'), null);
  assert.equal(dom.window.document.querySelector('#saved-heading'), null);
  assert.equal(dom.window.document.body.textContent.includes('<img'), false);
  dom.window.close();
});
test('saving clears entered key only after successful atomic settings response', async () => {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const requests = [];
  let fail = true;
  dom.window.chrome = { runtime: { sendMessage: async message => { requests.push(message); return message.type === 'GET_SETTINGS' ? { hasKey: false } : fail ? { error: 'Storage unavailable.' } : { hasKey: true }; } } };
  dom.window.eval(script); await tick();
  const input = dom.window.document.querySelector('#api-key');
  const form = dom.window.document.querySelector('#key-form');
  input.value = 'test-value';
  form.dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await tick();
  assert.equal(input.value, 'test-value');
  fail = false;
  form.dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await tick();
  assert.equal(input.value, '');
  assert.equal(requests.at(-1).type, 'SAVE_SETTINGS');
  assert.equal(requests.at(-1).key, 'test-value');
  assert.equal(dom.window.document.body.textContent.includes('test-value'), false);
  dom.window.close();
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { JSDOM } from 'jsdom';
const html = await fs.readFile(new URL('../src/saved.html', import.meta.url), 'utf8');
const source = await fs.readFile(new URL('../src/saved.js', import.meta.url), 'utf8');
const css = await fs.readFile(new URL('../src/saved.css', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const sample = { id: 'abcDEF12345', title: 'A useful video', url: 'https://www.youtube.com/watch?v=abcDEF12345', timestamp: 75, goal: 'Fix a specific problem', savedAt: '2026-09-21T12:00:00Z' };
async function setup(saved = [], error = false) {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  const messages = [];
  dom.window.chrome = { runtime: { sendMessage: async message => {
    messages.push(message);
    if (message.type === 'REMOVE_SAVED') {
      if (error) return { error: 'Could not remove this video.' };
      saved = saved.filter(video => video.id !== message.id);
    }
    return { saved };
  } } };
  dom.window.eval(source); await tick();
  return { dom, messages, document: dom.window.document };
}
test('saved videos show real titles, goal and timestamp with safe resume links', async () => {
  const env = await setup([sample]);
  const link = env.document.querySelector('#saved-list h2 a');
  assert.equal(link.textContent, sample.title);
  assert.equal(new URL(link.href).searchParams.get('t'), '75');
  assert.equal(link.rel, 'noopener noreferrer');
  assert.match(env.document.querySelector('#saved-list').textContent, /Resume at 1:15/);
  assert.match(env.document.querySelector('#saved-list').textContent, /Fix a specific problem/);
  assert.equal(env.document.querySelector('#empty').hidden, true);
  env.dom.window.close();
});
test('bookmark text cannot inject HTML and non-video or foreign links are rejected', async () => {
  const env = await setup([
    { ...sample, title: '<img src=x onerror=alert(1)>', goal: '<script>bad()</script>' },
    { ...sample, id: 'b', url: 'javascript:alert(1)' },
    { ...sample, id: 'c', url: 'https://example.com/watch?v=c' },
    { ...sample, id: 'd', url: 'https://www.youtube.com/redirect?q=bad' },
  ]);
  assert.equal(env.document.querySelectorAll('#saved-list li').length, 1);
  assert.equal(env.document.querySelector('#saved-list img'), null);
  assert.equal(env.document.querySelector('#saved-list script'), null);
  assert.match(env.document.querySelector('#saved-list').textContent, /<img/);
  env.dom.window.close();
});
test('remove updates list and reveals useful empty state without changing filtering', async () => {
  const env = await setup([sample]);
  env.document.querySelector('.remove').click(); await tick();
  assert.equal(env.messages.at(-1).type, 'REMOVE_SAVED');
  assert.equal(env.messages.at(-1).id, sample.id);
  assert.equal(env.document.querySelectorAll('#saved-list li').length, 0);
  assert.equal(env.document.querySelector('#empty').hidden, false);
  assert.match(env.document.querySelector('#empty').textContent, /Save video/);
  assert.equal(env.messages.some(m => m.type === 'SET_ACTIVE'), false);
  env.dom.window.close();
});
test('failed removal leaves the bookmark available and allows retry', async () => {
  const env = await setup([sample], true);
  env.document.querySelector('.remove').click(); await tick();
  assert.equal(env.document.querySelectorAll('#saved-list li').length, 1);
  assert.equal(env.document.querySelector('.remove').disabled, false);
  assert.match(env.document.querySelector('#status').textContent, /Could not remove/);
  env.dom.window.close();
});
test('saved page includes light and dark OS themes, no em dash or eyebrow', () => {
  assert.match(css, /prefers-color-scheme: dark/);
  assert.match(css, /color-scheme: light dark/);
  assert.equal((html + source).includes('\u2014'), false);
  assert.equal(html.includes('eyebrow'), false);
});

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

function reminderPage(sendMessage) {
  const dom = new JSDOM(html, { runScripts: 'outside-only' });
  dom.window.chrome = { runtime: { sendMessage } };
  dom.window.eval(script);
  const document = dom.window.document;
  return {
    dom,
    document,
    input: document.querySelector('#reminder-minutes'),
    status: document.querySelector('#reminder-status'),
    edit(value) {
      this.input.value = value;
      this.input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    },
    submit() { document.querySelector('#reminder-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true })); }
  };
}

test('reminders default to 10 minutes and load the saved whole-minute setting', async () => {
  let state = { hasKey: false };
  const page = reminderPage(async () => state);
  await tick();
  assert.equal(page.input.value, '10');
  assert.equal(page.input.getAttribute('inputmode'), 'numeric');
  state = { hasKey: false, reminderMinutes: 25 };
  page.dom.window.dispatchEvent(new page.dom.window.Event('focus'));
  await tick();
  assert.equal(page.input.value, '25');
  page.dom.window.close();
});

test('reminders reject empty, fractional, exponent, nonfinite, unsafe and nonpositive minutes', async () => {
  const requests = [];
  const page = reminderPage(async message => { requests.push(message); return { reminderMinutes: 10 }; });
  await tick();
  for (const value of ['', ' ', '0', '-1', '1.5', '10.0', '1e2', 'Infinity', 'NaN', '9007199254740992', '5 minutes', '10:30', '+5']) {
    page.edit(value);
    page.submit();
    await tick();
    assert.equal(requests.filter(message => message.type === 'SAVE_REMINDER_SETTINGS').length, 0, value);
    assert.equal(page.input.getAttribute('aria-invalid'), 'true', value);
    assert.match(page.status.textContent, /positive whole number of minutes/, value);
    assert.equal(page.document.activeElement, page.input, value);
  }
  page.dom.window.close();
});

test('saving reminders sends only minutes and preserves an unsaved API key', async () => {
  const requests = [];
  const page = reminderPage(async message => {
    requests.push(message);
    return { hasKey: true, reminderMinutes: message.type === 'SAVE_REMINDER_SETTINGS' ? message.minutes : 10 };
  });
  await tick();
  page.document.querySelector('#api-key').value = 'unsaved-test-key';
  page.edit(' 15 ');
  page.submit();
  await tick();
  assert.deepEqual(JSON.parse(JSON.stringify(requests.at(-1))), { type: 'SAVE_REMINDER_SETTINGS', minutes: 15 });
  assert.equal(page.input.value, '15');
  assert.equal(page.document.querySelector('#api-key').value, 'unsaved-test-key');
  assert.equal(page.status.textContent, 'Reminder saved.');
  assert.equal(page.document.querySelector('#save-reminder').disabled, false);
  assert.equal(page.document.querySelector('#status').textContent, '');
  page.dom.window.close();
});

test('unsaved reminder edits survive focus refreshes and API-key saves', async () => {
  const page = reminderPage(async () => ({ hasKey: true, reminderMinutes: 10 }));
  await tick();
  page.edit('27');
  page.dom.window.dispatchEvent(new page.dom.window.Event('focus'));
  await tick();
  assert.equal(page.input.value, '27');
  page.document.querySelector('#api-key').value = 'test-key';
  page.document.querySelector('#key-form').dispatchEvent(new page.dom.window.Event('submit', { cancelable: true }));
  await tick();
  assert.equal(page.input.value, '27');
  page.dom.window.close();
});

test('reminder edits made before initial settings arrive are preserved', async () => {
  let resolveSettings;
  const page = reminderPage(() => new Promise(resolve => { resolveSettings = resolve; }));
  page.edit('23');
  resolveSettings({ reminderMinutes: 10 });
  await tick();
  assert.equal(page.input.value, '23');
  page.dom.window.close();
});

test('failed reminder saves keep the edit and support retry without touching key controls', async () => {
  let fail = true;
  const page = reminderPage(async message => message.type === 'GET_SETTINGS'
    ? { reminderMinutes: 10 }
    : fail ? { error: 'Storage unavailable.' } : { reminderMinutes: message.minutes });
  await tick();
  page.edit('20');
  page.submit();
  await tick();
  assert.equal(page.input.value, '20');
  assert.match(page.status.textContent, /Could not save your reminder/);
  assert.equal(page.document.querySelector('#save-reminder').disabled, false);
  assert.equal(page.document.querySelector('#save-key').disabled, false);
  page.dom.window.dispatchEvent(new page.dom.window.Event('focus'));
  await tick();
  assert.equal(page.input.value, '20');
  fail = false;
  page.submit();
  await tick();
  assert.equal(page.status.textContent, 'Reminder saved.');
  page.dom.window.close();
});

test('an in-flight reminder save preserves newer edits and prevents duplicate submissions', async () => {
  let completeSave;
  let saveCount = 0;
  const page = reminderPage(message => {
    if (message.type === 'GET_SETTINGS') return Promise.resolve({ reminderMinutes: 10 });
    saveCount += 1;
    return new Promise(resolve => { completeSave = resolve; });
  });
  await tick();
  page.edit('15');
  page.submit();
  page.submit();
  assert.equal(saveCount, 1);
  assert.equal(page.document.querySelector('#save-reminder').disabled, true);
  assert.equal(page.document.querySelector('#save-key').disabled, false);
  page.edit('30');
  completeSave({ reminderMinutes: 15 });
  await tick();
  assert.equal(page.input.value, '30');
  assert.match(page.status.textContent, /latest edit has not been saved/);
  page.dom.window.dispatchEvent(new page.dom.window.Event('focus'));
  await tick();
  assert.equal(page.input.value, '30');
  page.dom.window.close();
});

for (const readSource of ['initial', 'focus']) {
  test(`a completed reminder save cannot be overwritten by an older ${readSource} read`, async () => {
    let finishRead;
    let readCount = 0;
    const page = reminderPage(message => {
      if (message.type === 'SAVE_REMINDER_SETTINGS') return Promise.resolve({ reminderMinutes: message.minutes });
      readCount += 1;
      if (readCount === (readSource === 'initial' ? 1 : 2)) {
        return new Promise(resolve => { finishRead = resolve; });
      }
      return Promise.resolve({ reminderMinutes: 10 });
    });
    if (readSource === 'focus') {
      await tick();
      page.dom.window.dispatchEvent(new page.dom.window.Event('focus'));
    }
    page.edit('15');
    page.submit();
    await tick();
    assert.equal(page.input.value, '15');
    finishRead({ reminderMinutes: 10 });
    await tick();
    assert.equal(page.input.value, '15');
    assert.equal(page.status.textContent, 'Reminder saved.');
    page.dom.window.close();
  });
}

test('a key save response applies its key state without overwriting a concurrent reminder save', async () => {
  let finishKeySave;
  const page = reminderPage(message => {
    if (message.type === 'GET_SETTINGS') return Promise.resolve({ hasKey: false, reminderMinutes: 10 });
    if (message.type === 'SAVE_SETTINGS') return new Promise(resolve => { finishKeySave = resolve; });
    return Promise.resolve({ hasKey: false, reminderMinutes: message.minutes });
  });
  await tick();
  page.document.querySelector('#api-key').value = 'test-key';
  page.document.querySelector('#key-form').dispatchEvent(new page.dom.window.Event('submit', { cancelable: true }));
  page.edit('15');
  page.submit();
  await tick();
  finishKeySave({ hasKey: true, reminderMinutes: 10 });
  await tick();
  assert.equal(page.input.value, '15');
  assert.equal(page.status.textContent, 'Reminder saved.');
  assert.match(page.document.querySelector('#key-status').textContent, /A key is saved/);
  assert.equal(page.document.querySelector('#ready').hidden, false);
  page.dom.window.close();
});

test('a reminder save response cannot undo a concurrent key save', async () => {
  let finishReminderSave;
  const page = reminderPage(message => {
    if (message.type === 'GET_SETTINGS') return Promise.resolve({ hasKey: false, reminderMinutes: 10 });
    if (message.type === 'SAVE_REMINDER_SETTINGS') return new Promise(resolve => { finishReminderSave = resolve; });
    return Promise.resolve({ hasKey: true, reminderMinutes: 10 });
  });
  await tick();
  page.edit('15');
  page.submit();
  page.document.querySelector('#api-key').value = 'test-key';
  page.document.querySelector('#key-form').dispatchEvent(new page.dom.window.Event('submit', { cancelable: true }));
  await tick();
  finishReminderSave({ hasKey: false, reminderMinutes: 15 });
  await tick();
  assert.equal(page.input.value, '15');
  assert.match(page.document.querySelector('#key-status').textContent, /A key is saved/);
  assert.equal(page.document.querySelector('#ready').hidden, false);
  page.dom.window.close();
});

test('a focus read started during a save cannot overwrite its completed value', async () => {
  let finishReminderSave;
  let finishRead;
  let readCount = 0;
  const page = reminderPage(message => {
    if (message.type === 'SAVE_REMINDER_SETTINGS') return new Promise(resolve => { finishReminderSave = resolve; });
    readCount += 1;
    return readCount === 1 ? Promise.resolve({ reminderMinutes: 10 }) : new Promise(resolve => { finishRead = resolve; });
  });
  await tick();
  page.edit('15');
  page.submit();
  page.dom.window.dispatchEvent(new page.dom.window.Event('focus'));
  finishReminderSave({ reminderMinutes: 15 });
  await tick();
  finishRead({ reminderMinutes: 10 });
  await tick();
  assert.equal(page.input.value, '15');
  page.dom.window.close();
});

test('out-of-order focus reads keep the most recently requested settings', async () => {
  const reads = [];
  const page = reminderPage(() => new Promise(resolve => { reads.push(resolve); }));
  page.dom.window.dispatchEvent(new page.dom.window.Event('focus'));
  reads[1]({ hasKey: true, reminderMinutes: 30 });
  await tick();
  reads[0]({ hasKey: false, reminderMinutes: 10 });
  await tick();
  assert.equal(page.input.value, '30');
  assert.match(page.document.querySelector('#key-status').textContent, /A key is saved/);
  page.dom.window.close();
});

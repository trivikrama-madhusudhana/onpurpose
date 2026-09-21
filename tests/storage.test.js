import test from 'node:test';
import assert from 'node:assert/strict';
import { encryptedStorage } from '../src/storage.js';
function localStore(initial = {}) {
  const data = structuredClone(initial);
  return { data, setAccessLevel: async () => {}, get: async keys => Object.fromEntries(keys.filter(k => k in data).map(k => [k, data[k]])), set: async patch => Object.assign(data, structuredClone(patch)), remove: async keys => keys.forEach(k => delete data[k]) };
}
const key = () => crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
test('legacy values migrate without plaintext, survive restart, and merge concurrent writes', async () => {
  const device = await key();
  const initial = { key: 'test-only-credential', goal: 'learn guitar', saved: [{ url: 'https://www.youtube.com/watch?v=abc', timestamp: 37 }], active: true };
  const local = localStore(initial);
  const storage = encryptedStorage(local, async () => device);
  assert.deepEqual(await storage.get(Object.keys(initial)), initial);
  assert.deepEqual(Object.keys(local.data), ['encryptedStateV1']);
  assert.equal(JSON.stringify(local.data).includes(initial.key), false);
  const previous = local.data.encryptedStateV1.iv;
  await Promise.all([storage.set({ goal: 'learn piano' }), storage.set({ active: false })]);
  assert.notEqual(local.data.encryptedStateV1.iv, previous);
  assert.deepEqual(await encryptedStorage(local, async () => device).get(Object.keys(initial)), { ...initial, goal: 'learn piano', active: false });
  await storage.set({ key: '' });
  assert.equal((await encryptedStorage(local, async () => device).get(['key'])).key, '');
});
test('failed migration keeps original settings with no plaintext fallback', async () => {
  const local = localStore({ key: 'test-only-credential', goal: 'learn guitar' });
  local.set = async () => { throw new Error('disk full'); };
  await assert.rejects(encryptedStorage(local, key).get(['key']), /securely/);
  assert.equal(local.data.key, 'test-only-credential');
});
test('interrupted plaintext cleanup completes on the next startup', async () => {
  const device = await key(), local = localStore({ goal: 'learn guitar' });
  const remove = local.remove;
  local.remove = async () => { throw new Error('interrupted'); };
  await assert.rejects(encryptedStorage(local, async () => device).get(['goal']), /securely/);
  assert.equal(local.data.goal, 'learn guitar');
  assert.ok(local.data.encryptedStateV1);
  local.remove = remove;
  assert.deepEqual(await encryptedStorage(local, async () => device).get(['goal']), { goal: 'learn guitar' });
  assert.deepEqual(Object.keys(local.data), ['encryptedStateV1']);
});
test('corruption and wrong device key fail closed without replacing saved data', async () => {
  const device = await key(), other = await key(), local = localStore({ goal: 'learn guitar' });
  await encryptedStorage(local, async () => device).get(['goal']);
  const record = structuredClone(local.data);
  await assert.rejects(encryptedStorage(local, async () => other).get(['goal']), /securely/);
  assert.deepEqual(local.data, record);
  local.data.encryptedStateV1.ciphertext = 'AAAA';
  await assert.rejects(encryptedStorage(local, async () => device).get(['goal']), /securely/);
});
test('failed update preserves both in-memory state and encrypted stored data', async () => {
  const device = await key(), local = localStore({ goal: 'learn guitar' });
  const storage = encryptedStorage(local, async () => device);
  await storage.get(['goal']);
  const record = structuredClone(local.data);
  local.set = async () => { throw new Error('disk full'); };
  await assert.rejects(storage.set({ goal: 'learn piano' }), /disk full/);
  assert.deepEqual(await storage.get(['goal']), { goal: 'learn guitar' });
  assert.deepEqual(local.data, record);
});

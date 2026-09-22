/** Encrypt persisted settings. The non-exportable device key stays in extension IndexedDB. */
const FIELDS = ['key', 'goal', 'active', 'saved', 'usage', 'reminderMinutes', 'reminderGeneration'];
const RECORD = 'encryptedStateV1';
export async function deviceKey() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('onpurpose-device-key', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('keys');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Local storage could not be opened.'));
  });
  try {
    const read = () => new Promise((resolve, reject) => {
      const request = db.transaction('keys').objectStore('keys').get('aes');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(new Error('Local storage could not be read.'));
    });
    const existing = await read();
    if (existing) return existing;
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    // Recheck inside a write transaction so concurrent startup cannot replace a device key.
    await new Promise((resolve, reject) => {
      const tx = db.transaction('keys', 'readwrite');
      const store = tx.objectStore('keys');
      const request = store.get('aes');
      request.onsuccess = () => { if (!request.result) store.put(key, 'aes'); };
      tx.oncomplete = resolve;
      tx.onerror = tx.onabort = () => reject(new Error('Local storage could not be saved.'));
    });
    return await read();
  } finally { db.close(); }
}
function encode(bytes) {
  let value = '';
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}
function decode(value) { return Uint8Array.from(atob(value), c => c.charCodeAt(0)); }
export function encryptedStorage(local, getKey = deviceKey) {
  let key, state, loading, pending = Promise.resolve();
  async function persist(value) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes);
    await local.set({ [RECORD]: { version: 1, iv: encode(iv), ciphertext: encode(new Uint8Array(encrypted)) } });
  }
  async function load() {
    if (!loading) loading = (async () => {
      key = await getKey();
      const stored = await local.get([RECORD, ...FIELDS]);
      if (stored[RECORD]) {
        const record = stored[RECORD];
        if (record.version !== 1) throw new Error('Unsupported local storage version.');
        const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(record.iv) }, key, decode(record.ciphertext));
        state = JSON.parse(new TextDecoder().decode(plaintext));
      } else {
        state = Object.fromEntries(FIELDS.filter(name => Object.hasOwn(stored, name)).map(name => [name, stored[name]]));
        await persist(state);
      }
      // Delete legacy plaintext only after a successful encrypted write or read.
      await local.remove(FIELDS);
    })().catch(() => { throw new Error('Saved settings could not be opened securely.'); });
    await loading;
  }
  return {
    setAccessLevel: options => local.setAccessLevel(options),
    async get(fields) {
      await pending; await load();
      return structuredClone(Object.fromEntries(fields.filter(name => Object.hasOwn(state, name)).map(name => [name, state[name]])));
    },
    set(patch) {
      const operation = pending.then(async () => {
        await load();
        const next = { ...state, ...structuredClone(patch) };
        await persist(next);
        state = next;
      });
      pending = operation.catch(() => {});
      return operation;
    },
  };
}

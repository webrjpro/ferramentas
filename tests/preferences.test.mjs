import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../js/preferences.js', import.meta.url), 'utf8');

test('preferências são lidas e gravadas no mesmo banco IndexedDB', async () => {
  const values = new Map();
  let opens = 0;
  const database = {
    objectStoreNames: { contains: () => false },
    createObjectStore: () => {},
    close: () => {},
  };
  database.transaction = () => {
    const transaction = {
      objectStore: () => ({
        get(key) {
          const request = {};
          queueMicrotask(() => { request.result = values.get(key); request.onsuccess(); });
          return request;
        },
        put(value, key) {
          values.set(key, value);
          queueMicrotask(() => transaction.oncomplete());
        },
      }),
    };
    return transaction;
  };
  const window = {
    indexedDB: {
      open(name, version) {
        assert.equal(name, 'ferramentas-locais');
        assert.equal(version, 1);
        opens += 1;
        const request = { result: database };
        queueMicrotask(() => { request.onupgradeneeded(); request.onsuccess(); });
        return request;
      },
    },
  };
  runInNewContext(source, { window });
  await window.AppPreferences.set('tema', 'dark');
  assert.equal(await window.AppPreferences.get('tema'), 'dark');
  assert.equal(opens, 1);
});

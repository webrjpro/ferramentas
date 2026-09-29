/* Copyright (c) 2026 Carlos Antonio de Oliveira Piquet. Todos os direitos reservados. */
(function () {
  "use strict";

  const databaseName = "ferramentas-locais";
  const storeName = "preferencias";
  let connection;

  function open() {
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error("IndexedDB indisponível"));
        return;
      }
      const request = window.indexedDB.open(databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("IndexedDB bloqueado"));
    }).catch((error) => {
      connection = undefined;
      throw error;
    });
    return connection;
  }

  async function get(key) {
    const database = await open();
    return new Promise((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async function set(key, value) {
    const database = await open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite");
      transaction.objectStore(storeName).put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  window.AppPreferences = Object.freeze({ get, set });
})();

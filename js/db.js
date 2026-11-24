// Minimal IndexedDB wrapper. All personal data stays on the device.
const DB_NAME = 'coach';
const VERSION = 1;
export const STORES = ['kv', 'workouts', 'food', 'body', 'photos', 'customFoods', 'meals', 'days'];
const KEYS = { kv: 'k', days: 'date' };

let dbp;
export function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    // Migrations are additive only, so updates never drop data.
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) {
          const os = db.createObjectStore(s, { keyPath: KEYS[s] || 'id' });
          if (!KEYS[s]) os.createIndex('date', 'date');
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

const tx = async (store, mode, fn) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    fn(t.objectStore(store));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
};
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const get = async (store, key) => { const db = await open(); return req(db.transaction(store).objectStore(store).get(key)); };
export const all = async (store) => { const db = await open(); return req(db.transaction(store).objectStore(store).getAll()); };
export const put = (store, obj) => tx(store, 'readwrite', (os) => { os.put(obj); });
export const del = (store, key) => tx(store, 'readwrite', (os) => { os.delete(key); });
export const clear = (store) => tx(store, 'readwrite', (os) => { os.clear(); });
export const putMany = (store, list) => tx(store, 'readwrite', (os) => { for (const o of list) os.put(o); });

export const kvGet = async (k, fallback) => { const r = await get('kv', k); return r ? r.v : fallback; };
export const kvSet = (k, v) => put('kv', { k, v });

// Ask Safari to keep our storage (home-screen apps are already exempt from 7-day eviction).
export async function persist() {
  try { if (navigator.storage?.persist) return await navigator.storage.persist(); } catch { /* ignore */ }
  return false;
}

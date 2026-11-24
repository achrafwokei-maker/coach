// Backup / restore of everything (including photos) as a single JSON file.
import * as db from './db.js';

const blobToDataURL = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
export const dataURLToBlob = async (u) => (await fetch(u)).blob();

export async function exportAll() {
  const out = { app: 'coach', kind: 'backup', version: 1, exportedAt: new Date().toISOString(), kv: await db.all('kv'), stores: {} };
  for (const s of db.STORES) {
    if (s === 'kv') continue;
    const rows = await db.all(s);
    if (s === 'photos') {
      out.stores.photos = await Promise.all(rows.map(async (p) => ({ ...p, blob: undefined, thumb: undefined, data: p.blob ? await blobToDataURL(p.blob) : null, thumbData: p.thumb ? await blobToDataURL(p.thumb) : null })));
    } else if (s === 'food') {
      out.stores.food = await Promise.all(rows.map(async (e) => (e.photo?.blob ? { ...e, photo: { id: e.photo.id, data: await blobToDataURL(e.photo.blob), thumbData: e.photo.thumb ? await blobToDataURL(e.photo.thumb) : null } } : e)));
    } else out.stores[s] = rows;
  }
  return out;
}

async function revivePhotos(list) {
  return Promise.all((list || []).map(async (p) => {
    const { data, thumbData, ...rest } = p;
    return { ...rest, blob: data ? await dataURLToBlob(data) : null, thumb: thumbData ? await dataURLToBlob(thumbData) : data ? await dataURLToBlob(data) : null };
  }));
}

async function revive(store, rows) {
  if (store === 'photos') return revivePhotos(rows);
  if (store === 'food') return Promise.all((rows || []).map(async (e) => (e.photo?.data ? { ...e, photo: (await revivePhotos([e.photo]))[0] } : e)));
  return rows || [];
}

export function validate(json) {
  if (!json || json.app !== 'coach' || !['backup', 'setup'].includes(json.kind)) throw new Error('This file is not a Coach backup or setup file.');
  return json.kind;
}

// Full restore replaces everything. A setup file only merges profile, targets, body entries and photos.
export async function importFile(json) {
  const kind = validate(json);
  if (kind === 'backup') {
    for (const s of db.STORES) await db.clear(s);
    await db.putMany('kv', json.kv || []);
    for (const [s, rows] of Object.entries(json.stores || {})) {
      if (!db.STORES.includes(s)) continue;
      await db.putMany(s, await revive(s, rows));
    }
  } else {
    for (const { k, v } of json.kv || []) await db.kvSet(k, v);
    for (const [s, rows] of Object.entries(json.stores || {})) {
      if (!db.STORES.includes(s) || s === 'kv') continue;
      await db.putMany(s, await revive(s, rows));
    }
  }
  return kind;
}

// Hand the file to iOS: the share sheet lets you "Save to Files" / AirDrop. Falls back to a download.
export async function shareJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const file = new File([blob], filename, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'downloaded';
}

// Local-first data. No account, cloud sync, tracking, or credential storage.
//
// Schema v2: file contents live in a separate `files` store keyed by resource id,
// so listing resources never touches file blobs. Callers keep using the same
// `get/put/remove('resources', …)` API; this module joins/splits blobs transparently.
import { crc32, readZip, zipBlobs } from './lib/zip.js?v=1.7.0';

const NAME = 'ucas-academic-bridge';
const VERSION = 4;
// Stores every backup must contain (present since v1).
const CORE_STORES = ['courses', 'resources', 'tasks', 'events', 'attempts', 'progress', 'settings'];
// Added in v3 (timetable, notes, study sessions, exams, grade book, smart review).
// Optional in backups so files made by older versions still restore.
const STUDY_STORES = ['schedule', 'notes', 'sessions', 'exams', 'grades', 'reviews'];
const STORES = [...CORE_STORES, ...STUDY_STORES];
const FILES = 'files';
// v4: deletion markers so deletes can be synced between devices.
const TOMBSTONES = 'tombstones';
const INDEXES = {
  resources: ['courseId'],
  tasks: ['courseId'],
  attempts: ['courseId'],
  schedule: ['courseId'],
  notes: ['courseId'],
  sessions: ['courseId'],
  exams: ['courseId'],
  reviews: ['courseId'],
};
let openPromise;
export const initialCourses = [
  'إدارة مشاريع نظم المعلومات الجغرافية',
  'بناء قواعد البيانات الجغرافية',
  'تطبيقات الاستشعار عن بعد',
  'تخطيط الخدمات المجتمعية والبنية التحتية',
  'ريادة الأعمال',
  'العمل الحر',
  'مقدمة في لغة البرمجة',
];
function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export function openDB() {
  if (!openPromise) {
    openPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(NAME, VERSION);
      req.onupgradeneeded = event => {
        const db = req.result;
        const tx = req.transaction;
        for (const store of STORES)
          if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(TOMBSTONES))
          db.createObjectStore(TOMBSTONES, { keyPath: 'key' });
        for (const [store, fields] of Object.entries(INDEXES)) {
          const bucket = tx.objectStore(store);
          for (const field of fields)
            if (!bucket.indexNames.contains(field))
              bucket.createIndex(field, field, { unique: false });
        }
        // v1 → v2: move inline blobs out of `resources` into `files`.
        if (event.oldVersion >= 1 && event.oldVersion < 2) {
          const resources = tx.objectStore('resources');
          const files = tx.objectStore(FILES);
          resources.openCursor().onsuccess = e => {
            const cursor = e.target.result;
            if (!cursor) return;
            const row = cursor.value;
            if (row.blob) {
              files.put({ id: row.id, blob: row.blob });
              const { blob, ...meta } = row;
              cursor.update({ ...meta, hasFile: true, size: meta.size ?? blob.size });
            }
            cursor.continue();
          };
        }
      };
      req.onblocked = () => {
        // Another tab still holds the old schema open.
        window.dispatchEvent?.(new CustomEvent('ucas-db-blocked'));
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          openPromise = null;
          window.dispatchEvent?.(new CustomEvent('ucas-db-outdated'));
        };
        resolve(db);
      };
      req.onerror = () => {
        openPromise = null;
        reject(req.error);
      };
    });
  }
  return openPromise;
}

/** Split a resource record into metadata (stored in `resources`) and its blob. */
function splitResource(value) {
  if (!value || !value.blob) return { meta: value, blob: null };
  const { blob, ...meta } = value;
  return { meta: { ...meta, hasFile: true, size: meta.size ?? blob.size }, blob };
}

/** All rows of a store. `resources` rows never include blobs (see `hasFile`). */
export async function all(store) {
  const db = await openDB();
  return request(db.transaction(store, 'readonly').objectStore(store).getAll());
}

/** Rows of a store for one course, using the `courseId` index when available. */
export async function byCourse(store, courseId) {
  const db = await openDB();
  const bucket = db.transaction(store, 'readonly').objectStore(store);
  if (bucket.indexNames.contains('courseId'))
    return request(bucket.index('courseId').getAll(courseId));
  return (await request(bucket.getAll())).filter(row => row.courseId === courseId);
}

/** One row. For `resources`, the stored file is joined back as `blob`. */
export async function get(store, id) {
  const db = await openDB();
  if (store !== 'resources')
    return request(db.transaction(store, 'readonly').objectStore(store).get(id));
  const tx = db.transaction(['resources', FILES], 'readonly');
  const [meta, file] = await Promise.all([
    request(tx.objectStore('resources').get(id)),
    request(tx.objectStore(FILES).get(id)),
  ]);
  if (!meta) return meta;
  return file?.blob ? { ...meta, blob: file.blob } : meta;
}

/** Only the stored file of a resource, or null. */
export async function getFile(id) {
  const db = await openDB();
  const file = await request(db.transaction(FILES, 'readonly').objectStore(FILES).get(id));
  return file?.blob || null;
}

/**
 * Every write is stamped with `_mtime` (ms) so devices can sync with last-write-wins.
 * opts.mtime: keep this time instead of now (0 = a default that any real edit beats).
 * opts.pulled: the row came from the cloud; it is not pushed back.
 */
function stamp(value, opts = {}) {
  const row = { ...value, _mtime: opts.mtime ?? Date.now() };
  if (opts.pulled) row._pulled = true;
  else delete row._pulled;
  return row;
}

export async function put(store, value, opts = {}) {
  const db = await openDB();
  if (store !== 'resources') {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(stamp(value, opts));
    await txDone(tx);
    return value;
  }
  const { meta, blob } = splitResource(value);
  const tx = db.transaction(['resources', FILES], 'readwrite');
  tx.objectStore('resources').put(stamp(meta, opts));
  if (blob) tx.objectStore(FILES).put({ id: meta.id, blob });
  await txDone(tx);
  return value;
}

export async function remove(store, id, opts = {}) {
  const db = await openDB();
  const names = store === 'resources' ? ['resources', FILES] : [store];
  const tx = db.transaction([...names, TOMBSTONES], 'readwrite');
  for (const name of names) tx.objectStore(name).delete(id);
  if (!opts.pulled)
    tx.objectStore(TOMBSTONES).put({ key: `${store}:${id}`, store, rid: id, _mtime: Date.now() });
  await txDone(tx);
}

// ---------- sync support ----------

/** Rows changed locally after `since` (ms), across all synced stores. Blobs excluded. */
export async function changedSince(since) {
  const out = [];
  for (const store of STORES) {
    for (const row of await all(store))
      if ((row._mtime ?? 1) > since && !row._pulled) out.push({ store, row });
  }
  return out;
}

export async function tombstonesSince(since) {
  const db = await openDB();
  const rows = await request(
    db.transaction(TOMBSTONES, 'readonly').objectStore(TOMBSTONES).getAll(),
  );
  return rows.filter(t => t._mtime > since);
}

export async function pruneTombstones(before) {
  const db = await openDB();
  const tx = db.transaction(TOMBSTONES, 'readwrite');
  const bucket = tx.objectStore(TOMBSTONES);
  for (const t of await request(bucket.getAll())) if (t._mtime < before) bucket.delete(t.key);
  await txDone(tx);
}

/** Raw stored row (resources without their file). */
export async function getRow(store, id) {
  const db = await openDB();
  return request(db.transaction(store, 'readonly').objectStore(store).get(id));
}

export async function setFile(id, blob) {
  const db = await openDB();
  const tx = db.transaction(FILES, 'readwrite');
  tx.objectStore(FILES).put({ id, blob });
  await txDone(tx);
}

export const syncedStores = STORES;

export async function replaceAll(store, entries) {
  const db = await openDB();
  const names = store === 'resources' ? ['resources', FILES] : [store];
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) tx.objectStore(name).clear();
  for (const entry of entries) {
    if (store !== 'resources') {
      tx.objectStore(store).put(entry);
      continue;
    }
    const { meta, blob } = splitResource(entry);
    tx.objectStore('resources').put(meta);
    if (blob) tx.objectStore(FILES).put({ id: meta.id, blob });
  }
  await txDone(tx);
}

export async function initialize() {
  const db = await openDB();
  const count = await request(db.transaction('courses', 'readonly').objectStore('courses').count());
  const initialized = await get('settings', 'seeded');
  if (!initialized) {
    if (!count) {
      for (let i = 0; i < initialCourses.length; i++) {
        await put(
          'courses',
          {
            id: `course-${i + 1}`,
            title: initialCourses[i],
            code: '',
            createdAt: new Date().toISOString(),
          },
          { mtime: 0 },
        );
      }
    }
    await put('settings', { id: 'seeded', value: true }, { mtime: 0 });
  }
}
export function makeId() {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
export const exportStores = STORES;

// ---------- Storage durability ----------

/** Ask the browser not to evict this site's data under storage pressure. */
export async function requestPersistence() {
  if (!navigator.storage?.persist) return { supported: false, persisted: false };
  try {
    const already = await navigator.storage.persisted();
    const persisted = already || (await navigator.storage.persist());
    return { supported: true, persisted };
  } catch {
    return { supported: true, persisted: false };
  }
}

/** Current usage/quota in bytes plus the persistence state. */
export async function storageStatus() {
  const out = { usage: null, quota: null, persisted: false, supported: !!navigator.storage };
  try {
    if (navigator.storage?.estimate) Object.assign(out, await navigator.storage.estimate());
    if (navigator.storage?.persisted) out.persisted = await navigator.storage.persisted();
  } catch {
    /* unavailable in some private modes */
  }
  return { usage: out.usage, quota: out.quota, persisted: out.persisted, supported: out.supported };
}

// ---------- Backup / restore ----------

async function blobToBase64(blob) {
  if (typeof FileReader !== 'undefined') {
    // Native encoder: avoids building a huge binary string in JS memory.
    const url = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return String(url).slice(String(url).indexOf(',') + 1);
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let n = 0; n < bytes.length; n += 8192)
    binary += String.fromCharCode(...bytes.subarray(n, n + 8192));
  return btoa(binary);
}

function base64ToBytes(data) {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Rows of every store, with each file handed to `encode(blob)` for serialising.
 * Resource rows carry their file inline (no `hasFile`) plus `blobType`.
 */
async function collectBackup(encode) {
  const stores = {};
  for (const store of STORES) {
    stores[store] = [];
    for (const row of await all(store)) {
      const blob = store === 'resources' && row.hasFile ? await getFile(row.id) : row.blob;
      if (!blob) {
        stores[store].push(row);
        continue;
      }
      const { blob: _inline, hasFile: _hasFile, ...meta } = row;
      stores[store].push({
        ...meta,
        ...(await encode(blob)),
        blobType: blob.type || row.type || 'application/octet-stream',
      });
    }
  }
  return { format: 'ucas-bridge-backup', exportedAt: new Date().toISOString(), stores };
}

/**
 * Backup format v1 (JSON, kept so older app versions can restore it):
 * resource rows carry their file as `blobData` (base64) + `blobType`.
 * Limited by the browser's maximum string length; the app now exports v2.
 */
export async function backup() {
  const data = await collectBackup(async blob => ({ blobData: await blobToBase64(blob) }));
  return { ...data, version: 1 };
}

/**
 * Backup format v2: a stored ZIP with `backup.json` (v1 layout, files replaced by
 * `blobFile` entry names) and one raw entry per file. Files are referenced, not
 * copied, so the size is bounded by disk space rather than memory.
 */
export async function backupArchive() {
  const entries = [];
  const data = await collectBackup(async blob => {
    const name = `files/${entries.length + 1}`;
    entries.push({ name, blob });
    return { blobFile: name };
  });
  const manifest = new Blob([JSON.stringify({ ...data, version: 2 })], {
    type: 'application/json',
  });
  return zipBlobs([{ name: 'backup.json', blob: manifest }, ...entries]);
}

function checkBackup(data, version) {
  if (!data || data.format !== 'ucas-bridge-backup' || data.version !== version || !data.stores)
    throw new Error('ملف النسخة الاحتياطية غير صالح');
  for (const store of CORE_STORES)
    if (!Array.isArray(data.stores[store])) throw new Error(`النسخة لا تحتوي على ${store}`);
  for (const store of STUDY_STORES)
    if (data.stores[store] !== undefined && !Array.isArray(data.stores[store]))
      throw new Error(`النسخة تحتوي على بيانات غير صالحة في ${store}`);
}

/** Decode and validate the complete backup before changing any local data. */
async function decodeStores(data, readBlob) {
  const replacement = {};
  const files = [];
  for (const store of STORES) {
    replacement[store] = [];
    for (const row of data.stores[store] || []) {
      if (!row || typeof row.id !== 'string' || !row.id)
        throw new Error(`سجل غير صالح ضمن ${store}`);
      const blob = await readBlob(row);
      if (!blob) {
        replacement[store].push(row);
        continue;
      }
      const { blobData: _data, blobFile: _file, blobType: _type, ...meta } = row;
      if (store !== 'resources') {
        replacement[store].push({ ...meta, blob });
        continue;
      }
      files.push({ id: meta.id, blob });
      replacement[store].push({ ...meta, hasFile: true, size: meta.size ?? blob.size });
    }
  }
  return { replacement, files };
}

async function replaceEverything({ replacement, files }) {
  const db = await openDB();
  // One IndexedDB transaction ensures restore is all-or-nothing.
  const tx = db.transaction([...STORES, FILES], 'readwrite');
  for (const store of [...STORES, FILES]) tx.objectStore(store).clear();
  for (const store of STORES) for (const row of replacement[store]) tx.objectStore(store).put(row);
  for (const file of files) tx.objectStore(FILES).put(file);
  await txDone(tx);
}

/** Restore a parsed v1 (JSON) backup. */
export async function restore(data) {
  checkBackup(data, 1);
  const decoded = await decodeStores(data, async row =>
    row.blobData ? new Blob([base64ToBytes(row.blobData)], { type: row.blobType }) : null,
  );
  await replaceEverything(decoded);
}

/** Restore a backup file chosen by the user: v2 ZIP, or a legacy v1 JSON. */
export async function restoreFile(file) {
  const magic = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (magic[0] !== 0x50 || magic[1] !== 0x4b) return restore(JSON.parse(await file.text()));
  const entries = new Map((await readZip(file)).map(e => [e.name, e]));
  const manifest = entries.get('backup.json');
  if (!manifest) throw new Error('ملف النسخة الاحتياطية غير صالح');
  const data = JSON.parse(await manifest.blob.text());
  checkBackup(data, 2);
  const decoded = await decodeStores(data, async row => {
    if (!row.blobFile) return null;
    const entry = entries.get(row.blobFile);
    const label = row.name || row.id;
    if (!entry) throw new Error(`ملف مفقود في النسخة: ${label}`);
    if ((await crc32(entry.blob)) !== entry.crc) throw new Error(`ملف تالف في النسخة: ${label}`);
    return entry.blob.slice(0, entry.size, row.blobType || 'application/octet-stream');
  });
  await replaceEverything(decoded);
}

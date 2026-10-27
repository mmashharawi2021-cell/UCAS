// Local-first data. No account, cloud sync, tracking, or credential storage.
const NAME = 'ucas-academic-bridge';
const VERSION = 1;
const STORES = ['courses', 'resources', 'tasks', 'events', 'attempts', 'progress', 'settings'];
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
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const store of STORES) if (!db.objectStoreNames.contains(store)) db.createObjectStore(store, { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => { openPromise = null; reject(req.error); };
    });
  }
  return openPromise;
}
export async function all(store) {
  const db = await openDB();
  return request(db.transaction(store, 'readonly').objectStore(store).getAll());
}
export async function get(store, id) {
  const db = await openDB();
  return request(db.transaction(store, 'readonly').objectStore(store).get(id));
}
export async function put(store, value) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value);
  await txDone(tx);
  return value;
}
export async function remove(store, id) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(id);
  await txDone(tx);
}
export async function replaceAll(store, entries) {
  const db = await openDB();
  const tx = db.transaction(store, 'readwrite');
  const bucket = tx.objectStore(store);
  bucket.clear();
  for (const entry of entries) bucket.put(entry);
  await txDone(tx);
}
export async function initialize() {
  const db = await openDB();
  const count = await request(db.transaction('courses', 'readonly').objectStore('courses').count());
  const initialized = await get('settings', 'seeded');
  if (!initialized) {
    if (!count) {
      for (let i = 0; i < initialCourses.length; i++) {
        await put('courses', {id: `course-${i+1}`, title: initialCourses[i], code: '', createdAt: new Date().toISOString()});
      }
    }
    await put('settings', {id:'seeded', value:true});
  }
}
export function makeId() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
export const exportStores = STORES;
export async function backup() {
  const data = {format:'ucas-bridge-backup', version:1, exportedAt:new Date().toISOString(), stores:{}};
  for (const store of STORES) {
    const rows = await all(store);
    data.stores[store] = await Promise.all(rows.map(async row => {
      if (!row.blob) return row;
      const bytes = new Uint8Array(await row.blob.arrayBuffer());
      // Avoid excessive argument length in String.fromCharCode.
      let binary=''; for(let n=0;n<bytes.length;n+=8192) binary+=String.fromCharCode(...bytes.slice(n,n+8192));
      const {blob,...meta}=row;
      return {...meta, blobData:btoa(binary), blobType:row.blob.type || 'application/octet-stream'};
    }));
  }
  return data;
}
export async function restore(data) {
  if (!data || data.format !== 'ucas-bridge-backup' || data.version !== 1 || !data.stores) throw new Error('ملف النسخة الاحتياطية غير صالح');
  for (const store of STORES) if (!Array.isArray(data.stores[store])) throw new Error(`النسخة لا تحتوي على ${store}`);
  // Decode and validate the complete backup before changing any local data.
  const replacement = {};
  for (const store of STORES) {
    replacement[store] = data.stores[store].map(row => {
      if (!row || typeof row.id !== 'string' || !row.id) throw new Error(`سجل غير صالح ضمن ${store}`);
      if (!row.blobData) return row;
      const bytes = Uint8Array.from(atob(row.blobData), x => x.charCodeAt(0));
      const {blobData,blobType,...meta}=row;
      return {...meta,blob:new Blob([bytes], {type:blobType})};
    });
  }
  const db=await openDB();
  // One IndexedDB transaction ensures restore is all-or-nothing.
  const tx=db.transaction(STORES,'readwrite');
  for (const store of STORES) {
    const objectStore=tx.objectStore(store);
    objectStore.clear();
    for(const row of replacement[store]) objectStore.put(row);
  }
  await txDone(tx);
}

// Two-way sync of all study data between the student's own devices (email account).
// Records: last write wins by the local `_mtime`. Pull cursor: the server's updated_at.
// Lecture files go to a private Storage bucket under <user id>/<resource id>.
// Files that fail to upload, download or delete are kept in per-account lists and retried on the
// next sync. Files over the bucket limit stay on their device and are reported.
import { getClient, run, CloudError } from './client.js?v=2.0.0';
import {
  changedSince,
  tombstonesSince,
  pruneTombstones,
  getRow,
  getFile,
  setFile,
  put,
  remove,
  syncedStores,
} from '../store.js?v=2.0.0';

const BUCKET = 'sync-files';
/** Largest file the `sync-files` bucket accepts (its file_size_limit, 50 MB). */
export const SYNC_FILE_MAX_BYTES = 52428800;
export const SYNC_FILE_MAX_LABEL = '50 MB';
const LOCAL_ONLY_SETTINGS = new Set(['seeded']);
/** At most this many bucket objects are removed per remove() call. */
const DELETE_BATCH = 1000;

// Resource ids become Storage paths: only makeId() shapes (UUID, or `${Date.now()}-base36`).
const RID = /^[A-Za-z0-9_-]{1,100}$/;
export const validRid = rid => typeof rid === 'string' && RID.test(rid);
/** `<uid>/<rid>` for the current session's uid; never built from an unvalidated id. */
function filePath(uid, rid) {
  if (!validRid(rid)) throw new Error('invalid resource id');
  return `${uid}/${rid}`;
}

// ---- local bookkeeping (localStorage, per account) ----
// `ucas-sync-<uid>`: sync meta. Cleared at sign-out and when the device data is deleted.
//   lastPush, lastPull, uploaded { rid: hash }, lastSyncAt  (as in 1.x)
//   pendingDown { rid: true }, tooLarge { rid: { name, direction } }, fileNames { rid: name }
//   Older clients ignore the added fields; missing ones default to empty.
// `ucas-owed-<uid>`: what this account still owes the cloud. Survives sign-out, so it is done on
//   the next sign-in with the same account (deletes first, before any pull). Never used for
//   another account. del { rid: { name } } bucket objects to remove; up { rid: true } uploads.
//   Names are dropped at sign-out (ids only stay on the device).
// `ucas-owed-device`: { account } the last account that synced here. Local tombstones are
//   device-wide, so a different account starts after them instead of receiving them.
const metaKey = uid => `ucas-sync-${uid}`;
const owedKey = uid => `ucas-owed-${uid}`;
const DEVICE_KEY = 'ucas-owed-device';

function readJSON(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '{}');
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: next sync re-checks everything, which is safe */
  }
}
const objectField = (obj, k) => (obj[k] && typeof obj[k] === 'object' ? obj[k] : {});

function loadMeta(uid) {
  const meta = {
    lastPush: 0,
    lastPull: '1970-01-01T00:00:00Z',
    ...readJSON(metaKey(uid)),
  };
  for (const k of ['uploaded', 'pendingDown', 'tooLarge', 'fileNames'])
    meta[k] = objectField(meta, k);
  return meta;
}
function loadOwed(uid) {
  const owed = readJSON(owedKey(uid));
  return { del: objectField(owed, 'del'), up: objectField(owed, 'up') };
}
function saveOwed(uid, owed) {
  if (Object.keys(owed.del).length || Object.keys(owed.up).length) writeJSON(owedKey(uid), owed);
  else
    try {
      localStorage.removeItem(owedKey(uid));
    } catch {
      /* ignore */
    }
}

/** Pending cloud deletions of this account on this device. */
export function owedDeleteCount(uid) {
  return uid ? Object.keys(loadOwed(uid).del).length : 0;
}

/**
 * Sign-out: forget this account's sync meta (cursors, names, lists). Pending deletions and
 * uploads stay, by id only, for the next sign-in with the same account. Study data is untouched.
 */
export function forgetSyncAccount(uid) {
  if (!uid) return;
  try {
    localStorage.removeItem(metaKey(uid));
  } catch {
    /* ignore */
  }
  const owed = loadOwed(uid);
  for (const rid of Object.keys(owed.del)) owed.del[rid] = { name: '' };
  saveOwed(uid, owed);
}

/**
 * The student deleted the app data on this device: forget every account's sync meta and
 * pending uploads (the files are gone). Pending cloud deletions stay, by id only.
 */
export function clearSyncMeta() {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (key?.startsWith('ucas-sync-')) localStorage.removeItem(key);
      else if (key?.startsWith('ucas-owed-') && key !== DEVICE_KEY) {
        const owed = readJSON(key);
        const del = {};
        for (const rid of Object.keys(objectField(owed, 'del'))) del[rid] = { name: '' };
        if (Object.keys(del).length) localStorage.setItem(key, JSON.stringify({ del, up: {} }));
        else localStorage.removeItem(key);
      }
    }
  } catch {
    /* storage blocked: nothing stored either */
  }
}

/** The signed-in email user, or null (anonymous nickname accounts cannot sync). */
export async function syncUser() {
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  const user = data.session?.user;
  return user && !user.is_anonymous && user.email ? { sb, user } : null;
}

export function lastSyncedAt(uid) {
  return loadMeta(uid).lastSyncAt || null;
}

/** Strip local-only fields before upload. */
function clean(row) {
  const { _pulled, blob, ...rest } = row;
  return rest;
}

/** Arabic, user-facing text for a file problem. `name` is plain text: escape it when rendering. */
export function problemMessage({ name, direction, reason }) {
  const file = `«${name || 'ملف بلا اسم'}»`;
  if (reason === 'too_large')
    return direction === 'up'
      ? `${file} أكبر من ${SYNC_FILE_MAX_LABEL}، بقي على هذا الجهاز فقط`
      : `${file} أكبر من ${SYNC_FILE_MAX_LABEL}، بقي على جهازك الآخر فقط ولم يُنزَّل هنا`;
  if (direction === 'delete')
    return `تعذر حذف ${file} من التخزين السحابي، ستُعاد المحاولة في المزامنة التالية`;
  return direction === 'up'
    ? `تعذر رفع ${file}، ستُعاد المحاولة في المزامنة التالية`
    : `تعذر تنزيل ${file}، ستُعاد المحاولة في المزامنة التالية`;
}
/** "توجد N ملفات محذوفة لم تُحذف من السحابة بعد" with Arabic number agreement. */
export function pendingDeletePhrase(n) {
  if (n === 1) return 'يوجد ملف واحد محذوف لم يُحذف من السحابة بعد';
  if (n === 2) return 'يوجد ملفان محذوفان لم يُحذفا من السحابة بعد';
  const r = n % 100;
  if (r >= 3 && r <= 10) return `توجد ${n} ملفات محذوفة لم تُحذف من السحابة بعد`;
  if (r >= 11) return `يوجد ${n} ملفًا محذوفًا لم يُحذف من السحابة بعد`;
  return `يوجد ${n} ملف محذوف لم يُحذف من السحابة بعد`;
}
const problem = (name, direction, reason) => ({
  name: name || '',
  direction,
  reason,
  message: problemMessage({ name, direction, reason }),
});
const errText = err => String(err?.message || err || 'unknown error').slice(0, 200);

/**
 * Remove owed bucket objects (`only`: just these ids) in one remove() call. A live row with the
 * same id cancels its deletion. Entries are dropped only when Storage reports no error (a path
 * that no longer exists is not an error). Returns one problem per id that failed.
 */
async function removeOwed(sb, uid, meta, owed, only = null) {
  const ids = [];
  for (const rid of only || Object.keys(owed.del)) {
    if (!owed.del[rid]) continue;
    if (!validRid(rid) || (await getRow('resources', rid))?.hasFile) delete owed.del[rid];
    else if (ids.length < DELETE_BATCH) ids.push(rid);
  }
  if (!ids.length) return [];
  let error = null;
  try {
    ({ error } = await sb.storage.from(BUCKET).remove(ids.map(rid => filePath(uid, rid))));
  } catch (err) {
    error = err;
  }
  if (error) {
    console.warn('sync: delete failed', ids.length, 'file(s)', errText(error));
    return ids.map(rid => problem(owed.del[rid]?.name || rid, 'delete', 'error'));
  }
  for (const rid of ids) {
    delete owed.del[rid];
    delete owed.up[rid];
    delete meta.uploaded[rid];
    delete meta.fileNames[rid];
    delete meta.pendingDown[rid];
    delete meta.tooLarge[rid];
  }
  return [];
}

let running = null;

export function syncNow(onProgress = () => {}) {
  running ??= doSync(onProgress).finally(() => (running = null));
  return running;
}

/** Sign-out helper: try the pending deletions now. Returns how many are still pending. */
export async function flushPendingDeletes() {
  if (running) await running.catch(() => {});
  const session = await syncUser();
  if (!session) return 0;
  const uid = session.user.id;
  const meta = loadMeta(uid);
  const owed = loadOwed(uid);
  await removeOwed(session.sb, uid, meta, owed);
  writeJSON(metaKey(uid), meta);
  saveOwed(uid, owed);
  return Object.keys(owed.del).length;
}

async function doSync(onProgress) {
  const session = await syncUser();
  if (!session) throw new CloudError({ message: 'not signed in' });
  const { sb, user } = session;
  const uid = user.id;
  const meta = loadMeta(uid);
  const owed = loadOwed(uid);
  const save = () => {
    writeJSON(metaKey(uid), meta);
    saveOwed(uid, owed);
  };
  // A different account than the last one here: local tombstones (device-wide) are not its own.
  const device = readJSON(DEVICE_KEY);
  if (device.account && device.account !== uid && !meta.tombsSince) meta.tombsSince = Date.now();
  if (device.account !== uid) writeJSON(DEVICE_KEY, { account: uid });
  const tombsFrom = Math.max(meta.lastPush, meta.tombsSince || 0);

  const stats = { pulled: 0, pushed: 0, filesUp: 0, filesDown: 0, problems: [] };
  const failed = [];

  // ---- 0. deletions this account still owes (e.g. from before a sign-out), before any pull ----
  if (Object.keys(owed.del).length) {
    onProgress('حذف الملفات المحذوفة من التخزين…');
    failed.push(...(await removeOwed(sb, uid, meta, owed)));
  }

  // ---- 1. pull ----
  onProgress('جاري جلب التغييرات…');
  // This account's local deletions: a remote row they are newer than is not brought back.
  const deletedHere = new Map();
  for (const t of await tombstonesSince(tombsFrom))
    deletedHere.set(`${t.store}:${t.rid}`, t._mtime);
  for (;;) {
    const rows = await run(
      sb
        .from('sync_records')
        .select('store, rid, data, mtime, deleted, updated_at')
        .gt('updated_at', meta.lastPull)
        .order('updated_at', { ascending: true })
        .limit(500),
    );
    for (const r of rows) {
      meta.lastPull = r.updated_at;
      if (!syncedStores.includes(r.store)) continue;
      if (r.store === 'resources' && !validRid(r.rid)) {
        console.warn('sync: ignored a resource record with an invalid id');
        continue;
      }
      const local = await getRow(r.store, r.rid);
      const localTime = local?._mtime ?? 1;
      if (r.deleted) {
        if (local && localTime <= r.mtime) {
          await remove(r.store, r.rid, { pulled: true });
          if (r.store === 'resources') {
            delete meta.pendingDown[r.rid];
            delete meta.tooLarge[r.rid];
            delete owed.up[r.rid];
          }
          stats.pulled++;
        }
        continue;
      }
      if (!local && (deletedHere.get(`${r.store}:${r.rid}`) ?? -1) >= r.mtime) continue;
      if (!local || localTime < r.mtime) {
        await put(r.store, { ...r.data, id: r.rid }, { mtime: r.mtime, pulled: true });
        stats.pulled++;
      } else if (
        r.store === 'resources' &&
        r.data?.hasFile &&
        !r.data.fileLocalOnly &&
        local.hash &&
        local.hash === r.data.hash &&
        !owed.up[r.rid] &&
        (await getFile(r.rid))
      ) {
        // Same file version as the record in the cloud (e.g. after signing in again): the
        // upload was done before, so it is not repeated. Failed uploads are in owed.up.
        meta.uploaded[r.rid] = local.hash;
      }
      // Checked again (local row, local file) in the download step.
      if (r.store === 'resources' && r.data?.hasFile) meta.pendingDown[r.rid] = true;
    }
    if (rows.length < 500) break;
  }
  save();

  const downloads = Object.keys(meta.pendingDown);
  let downIndex = 0;
  for (const rid of downloads) {
    downIndex++;
    const row = validRid(rid) ? await getRow('resources', rid) : null;
    if (!row || !row.hasFile || (await getFile(rid))) {
      delete meta.pendingDown[rid];
      if (meta.tooLarge[rid]?.direction === 'down') delete meta.tooLarge[rid];
      continue;
    }
    if (row.fileLocalOnly) {
      // The other device kept it (over the bucket limit); wait until that row changes.
      delete meta.pendingDown[rid];
      meta.tooLarge[rid] = { name: row.name || '', direction: 'down' };
      continue;
    }
    onProgress(`تنزيل الملفات (${downIndex}/${downloads.length})…`);
    let blob = null;
    let error = null;
    try {
      ({ data: blob, error } = await sb.storage.from(BUCKET).download(filePath(uid, rid)));
    } catch (err) {
      error = err;
    }
    if (error || !blob) {
      console.warn('sync: download failed', row.name, errText(error || 'empty file'));
      failed.push(problem(row.name, 'down', 'error'));
      continue; // stays in pendingDown
    }
    await setFile(rid, row.type ? new Blob([blob], { type: row.type }) : blob);
    meta.uploaded[rid] = row.hash || true;
    if (row.name) meta.fileNames[rid] = row.name;
    delete meta.pendingDown[rid];
    delete meta.tooLarge[rid];
    delete owed.del[rid];
    stats.filesDown++;
  }
  // Too-large entries from the other device: drop them once the situation changed.
  for (const [rid, entry] of Object.entries(meta.tooLarge)) {
    if (entry?.direction !== 'down') continue;
    const row = await getRow('resources', rid);
    if (!row || !row.hasFile || !row.fileLocalOnly || (await getFile(rid)))
      delete meta.tooLarge[rid];
    else entry.name = row.name || entry.name;
  }

  // ---- 2. push ----
  onProgress('جاري رفع التغييرات…');
  const scanStart = Date.now();
  const changed = (await changedSince(meta.lastPush)).filter(
    c => !(c.store === 'settings' && LOCAL_ONLY_SETTINGS.has(c.row.id)),
  );
  const tombs = await tombstonesSince(tombsFrom);
  // Files over the bucket limit: the record says so, so the other device does not keep retrying.
  // Without a local copy the row keeps the flag it was pulled with.
  const localOnly = new Map();
  for (const c of changed) {
    if (c.store !== 'resources' || !c.row.hasFile) continue;
    const blob = await getFile(c.row.id);
    if (blob) localOnly.set(String(c.row.id), blob.size > SYNC_FILE_MAX_BYTES);
  }
  const latest = new Map();
  for (const c of changed) {
    const data = clean(c.row);
    const flag = localOnly.get(String(c.row.id));
    if (flag === true) data.fileLocalOnly = true;
    else if (flag === false) delete data.fileLocalOnly;
    latest.set(`${c.store}:${c.row.id}`, {
      user_id: uid,
      store: c.store,
      rid: String(c.row.id),
      data,
      mtime: c.row._mtime,
      deleted: false,
    });
  }
  for (const t of tombs) {
    const key = `${t.store}:${t.rid}`;
    if (latest.has(key) && latest.get(key).mtime >= t._mtime) continue;
    // The pull brought back a newer row with this id: the older deletion must not overwrite it.
    if (!latest.has(key) && (await getRow(t.store, t.rid))) continue;
    latest.set(key, {
      user_id: uid,
      store: t.store,
      rid: String(t.rid),
      data: null,
      mtime: t._mtime,
      deleted: true,
    });
  }
  const rows = [...latest.values()];
  for (let i = 0; i < rows.length; i += 200) {
    await run(
      sb.from('sync_records').upsert(rows.slice(i, i + 200), { onConflict: 'user_id,store,rid' }),
    );
    stats.pushed += Math.min(200, rows.length - i);
  }

  // Files: new/changed ones, earlier failures, and too-large ones (re-checked, not re-sent).
  const candidates = new Set(Object.keys(owed.up));
  for (const c of changed)
    if (
      c.store === 'resources' &&
      c.row.hasFile &&
      meta.uploaded[c.row.id] !== (c.row.hash || true)
    )
      candidates.add(String(c.row.id));
  for (const [rid, entry] of Object.entries(meta.tooLarge))
    if (entry?.direction === 'up') candidates.add(rid);
  let upIndex = 0;
  for (const rid of candidates) {
    upIndex++;
    const row = validRid(rid) ? await getRow('resources', rid) : null;
    const blob = row?.hasFile ? await getFile(rid) : null;
    if (!row || !blob) {
      // Deleted, or no local copy (a pending download covers that case).
      delete owed.up[rid];
      if (meta.tooLarge[rid]?.direction === 'up') delete meta.tooLarge[rid];
      continue;
    }
    const key = row.hash || true;
    if (blob.size > SYNC_FILE_MAX_BYTES) {
      delete owed.up[rid];
      meta.tooLarge[rid] = { name: row.name || '', direction: 'up' };
      continue;
    }
    if (meta.uploaded[rid] === key && !owed.up[rid] && !meta.tooLarge[rid]) continue;
    onProgress(`رفع الملفات (${upIndex}/${candidates.size})…`);
    let error = null;
    try {
      ({ error } = await sb.storage.from(BUCKET).upload(filePath(uid, rid), blob, {
        upsert: true,
        contentType: row.type || 'application/octet-stream',
      }));
    } catch (err) {
      error = err;
    }
    if (error) {
      console.warn('sync: upload failed', row.name, errText(error));
      owed.up[rid] = true;
      failed.push(problem(row.name, 'up', 'error'));
      continue;
    }
    meta.uploaded[rid] = key;
    if (row.name) meta.fileNames[rid] = row.name;
    delete owed.up[rid];
    delete owed.del[rid]; // a new file under this id is never removed
    delete meta.tooLarge[rid];
    stats.filesUp++;
  }

  // Lectures deleted here: remove their bucket objects. Failures stay owed and are retried on
  // every sync (independent of the tombstone, which is pruned after 90 days).
  const newDeletes = [];
  for (const t of tombs) {
    const rid = String(t.rid);
    if (t.store !== 'resources' || !validRid(rid) || owed.del[rid]) continue;
    owed.del[rid] = { name: meta.fileNames[rid] || meta.tooLarge[rid]?.name || '' };
    newDeletes.push(rid);
  }
  if (newDeletes.length) {
    onProgress('حذف الملفات المحذوفة من التخزين…');
    failed.push(...(await removeOwed(sb, uid, meta, owed, newDeletes)));
  }

  meta.lastPush = scanStart;
  meta.lastSyncAt = new Date().toISOString();
  save();
  await pruneTombstones(Date.now() - 90 * 86400000);
  stats.problems = [
    ...Object.values(meta.tooLarge).map(e => problem(e.name, e.direction, 'too_large')),
    ...failed,
  ];
  return stats;
}

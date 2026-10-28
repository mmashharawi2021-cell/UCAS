// Two-way sync of all study data between the student's own devices (email account).
// Records: last write wins by the local `_mtime`. Pull cursor: the server's updated_at.
// Lecture files go to a private Storage bucket under <user id>/<resource id>.
import { getClient, run, CloudError } from './client.js?v=1.7.0';
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
} from '../store.js?v=1.7.0';

const BUCKET = 'sync-files';
const LOCAL_ONLY_SETTINGS = new Set(['seeded']);
const metaKey = uid => `ucas-sync-${uid}`;

function loadMeta(uid) {
  try {
    return {
      lastPush: 0,
      lastPull: '1970-01-01T00:00:00Z',
      uploaded: {},
      ...JSON.parse(localStorage.getItem(metaKey(uid)) || '{}'),
    };
  } catch {
    return { lastPush: 0, lastPull: '1970-01-01T00:00:00Z', uploaded: {} };
  }
}
function saveMeta(uid, meta) {
  try {
    localStorage.setItem(metaKey(uid), JSON.stringify(meta));
  } catch {
    /* storage blocked: next sync re-checks everything, which is safe */
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

let running = null;

export function syncNow(onProgress = () => {}) {
  running ??= doSync(onProgress).finally(() => (running = null));
  return running;
}

async function doSync(onProgress) {
  const session = await syncUser();
  if (!session) throw new CloudError({ message: 'not signed in' });
  const { sb, user } = session;
  const uid = user.id;
  const meta = loadMeta(uid);
  const stats = { pulled: 0, pushed: 0, filesUp: 0, filesDown: 0 };

  // ---- 1. pull ----
  onProgress('جاري جلب التغييرات…');
  const downloads = [];
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
      if (!syncedStores.includes(r.store)) continue;
      const local = await getRow(r.store, r.rid);
      const localTime = local?._mtime ?? 1;
      if (r.deleted) {
        if (local && localTime <= r.mtime) {
          await remove(r.store, r.rid, { pulled: true });
          stats.pulled++;
        }
      } else if (!local || localTime < r.mtime) {
        await put(r.store, { ...r.data, id: r.rid }, { mtime: r.mtime, pulled: true });
        stats.pulled++;
        if (r.store === 'resources' && r.data?.hasFile && !(await getFile(r.rid)))
          downloads.push(r.rid);
      }
      meta.lastPull = r.updated_at;
    }
    if (rows.length < 500) break;
  }
  for (const rid of downloads) {
    onProgress(`تنزيل الملفات (${stats.filesDown + 1}/${downloads.length})…`);
    const { data: blob, error } = await sb.storage.from(BUCKET).download(`${uid}/${rid}`);
    if (error || !blob) continue;
    const row = await getRow('resources', rid);
    await setFile(rid, row?.type ? new Blob([blob], { type: row.type }) : blob);
    meta.uploaded[rid] = row?.hash || true;
    stats.filesDown++;
  }

  // ---- 2. push ----
  onProgress('جاري رفع التغييرات…');
  const scanStart = Date.now();
  const changed = (await changedSince(meta.lastPush)).filter(
    c => !(c.store === 'settings' && LOCAL_ONLY_SETTINGS.has(c.row.id)),
  );
  const tombs = await tombstonesSince(meta.lastPush);
  const latest = new Map();
  for (const c of changed)
    latest.set(`${c.store}:${c.row.id}`, {
      user_id: uid,
      store: c.store,
      rid: String(c.row.id),
      data: clean(c.row),
      mtime: c.row._mtime,
      deleted: false,
    });
  for (const t of tombs) {
    const key = `${t.store}:${t.rid}`;
    if (latest.has(key) && latest.get(key).mtime >= t._mtime) continue;
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

  // Files: upload new/changed ones, delete removed ones.
  const uploads = changed.filter(
    c =>
      c.store === 'resources' && c.row.hasFile && meta.uploaded[c.row.id] !== (c.row.hash || true),
  );
  for (const c of uploads) {
    onProgress(`رفع الملفات (${stats.filesUp + 1}/${uploads.length})…`);
    const blob = await getFile(c.row.id);
    if (!blob) continue;
    const { error } = await sb.storage.from(BUCKET).upload(`${uid}/${c.row.id}`, blob, {
      upsert: true,
      contentType: c.row.type || 'application/octet-stream',
    });
    if (error) {
      console.warn('upload failed', c.row.name, error.message);
      continue;
    }
    meta.uploaded[c.row.id] = c.row.hash || true;
    stats.filesUp++;
  }
  const removedFiles = tombs.filter(t => t.store === 'resources').map(t => `${uid}/${t.rid}`);
  if (removedFiles.length) {
    await sb.storage.from(BUCKET).remove(removedFiles);
    for (const t of tombs) if (t.store === 'resources') delete meta.uploaded[t.rid];
  }

  meta.lastPush = scanStart;
  meta.lastSyncAt = new Date().toISOString();
  saveMeta(uid, meta);
  await pruneTombstones(Date.now() - 90 * 86400000);
  return stats;
}

// Lecture-file sync: the client limit equals the Storage bucket limit, problem messages name the
// file in plain text (the UI escapes it), ids are validated before they become Storage paths,
// and sign-out / device wipe keep only what the account still owes the cloud.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SYNC_FILE_MAX_BYTES,
  SYNC_FILE_MAX_LABEL,
  clearSyncMeta,
  forgetSyncAccount,
  owedDeleteCount,
  pendingDeletePhrase,
  problemMessage,
  validRid,
} from '../js/cloud/sync.js';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

function fakeLocalStorage(entries) {
  const data = new Map(Object.entries(entries));
  globalThis.localStorage = {
    get length() {
      return data.size;
    },
    key: i => [...data.keys()][i] ?? null,
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k),
  };
  return data;
}

test('client file limit equals file_size_limit of the sync-files bucket', async () => {
  const sql = await read('../supabase/migrations/20261028211000_personal_sync_and_ai.sql');
  const match =
    /insert into storage\.buckets \(id, name, public, file_size_limit\)\s*values \('sync-files',\s*'sync-files',\s*\w+,\s*(\d+)\)/i.exec(
      sql,
    );
  assert.ok(match, 'sync-files bucket insert not found in the migration');
  assert.equal(Number(match[1]), SYNC_FILE_MAX_BYTES);
  assert.equal(SYNC_FILE_MAX_BYTES, 50 * 1024 * 1024);
  assert.equal(SYNC_FILE_MAX_LABEL, '50 MB');
});

test('per-file problem messages in Arabic', () => {
  const msg = (direction, reason) => problemMessage({ name: 'X.pdf', direction, reason });
  assert.equal(msg('up', 'too_large'), '«X.pdf» أكبر من 50 MB، بقي على هذا الجهاز فقط');
  assert.equal(
    msg('down', 'too_large'),
    '«X.pdf» أكبر من 50 MB، بقي على جهازك الآخر فقط ولم يُنزَّل هنا',
  );
  assert.equal(msg('up', 'error'), 'تعذر رفع «X.pdf»، ستُعاد المحاولة في المزامنة التالية');
  assert.equal(msg('down', 'error'), 'تعذر تنزيل «X.pdf»، ستُعاد المحاولة في المزامنة التالية');
  assert.equal(
    msg('delete', 'error'),
    'تعذر حذف «X.pdf» من التخزين السحابي، ستُعاد المحاولة في المزامنة التالية',
  );
  // Plain text: escaping is the renderer's job (account.js uses esc()).
  assert.equal(
    problemMessage({ name: '<b>a</b>', direction: 'up', reason: 'error' }),
    'تعذر رفع «<b>a</b>»، ستُعاد المحاولة في المزامنة التالية',
  );
});

test('pending-delete warning agrees with the number', () => {
  assert.equal(pendingDeletePhrase(1), 'يوجد ملف واحد محذوف لم يُحذف من السحابة بعد');
  assert.equal(pendingDeletePhrase(2), 'يوجد ملفان محذوفان لم يُحذفا من السحابة بعد');
  assert.equal(pendingDeletePhrase(3), 'توجد 3 ملفات محذوفة لم تُحذف من السحابة بعد');
  assert.equal(pendingDeletePhrase(10), 'توجد 10 ملفات محذوفة لم تُحذف من السحابة بعد');
  assert.equal(pendingDeletePhrase(11), 'يوجد 11 ملفًا محذوفًا لم يُحذف من السحابة بعد');
  assert.equal(pendingDeletePhrase(99), 'يوجد 99 ملفًا محذوفًا لم يُحذف من السحابة بعد');
  assert.equal(pendingDeletePhrase(100), 'يوجد 100 ملف محذوف لم يُحذف من السحابة بعد');
  assert.equal(pendingDeletePhrase(103), 'توجد 103 ملفات محذوفة لم تُحذف من السحابة بعد');
});

test('sync never logs file contents and the account UI escapes problem text', async () => {
  const sync = await read('../js/cloud/sync.js');
  const logs = sync.split('\n').filter(l => l.includes('console.'));
  assert.equal(logs.length, 4);
  const allowed = [
    "console.warn('sync: ignored a resource record with an invalid id')",
    "console.warn('sync: delete failed', ids.length, 'file(s)', errText(error))",
    "console.warn('sync: download failed', row.name, errText(error || 'empty file'))",
    "console.warn('sync: upload failed', row.name, errText(error))",
  ];
  assert.deepEqual(logs.map(l => l.trim().replace(/;$/, '')).sort(), allowed.sort());
  const account = await read('../js/features/account.js');
  assert.match(account, /\$\{esc\(p\.message\)\}/);
  assert.doesNotMatch(account, /\$\{p\.(message|name)\}/);
});

test('resource ids are validated before they become Storage paths', async () => {
  assert.ok(validRid(crypto.randomUUID()));
  assert.ok(validRid(`${Date.now()}-${Math.random().toString(36).slice(2)}`), 'makeId fallback');
  assert.ok(validRid('lec-1') && validRid('big_1'));
  for (const bad of ['../x', 'a/b', '..', '', 'a b', 'x'.repeat(101), 'a\\b', 'é', null, 5])
    assert.equal(validRid(bad), false, String(bad));
  const sync = await read('../js/cloud/sync.js');
  // One path builder, and it validates first.
  assert.equal(sync.match(/`\$\{uid\}\//g).length, 1);
  assert.match(sync, /function filePath\(uid, rid\) \{\n\s+if \(!validRid\(rid\)\) throw/);
});

test('sign-out forgets the sync meta but keeps the owed deletions (ids only)', () => {
  const data = fakeLocalStorage({
    'ucas-sync-u1': JSON.stringify({ lastPush: 5, fileNames: { r1: 'secret.pdf' } }),
    'ucas-owed-u1': JSON.stringify({ del: { r1: { name: 'secret.pdf' } }, up: { r2: true } }),
    'ucas-sync-u2': '{}',
    'ucas-cloud-auth': 'x',
  });
  try {
    assert.equal(owedDeleteCount('u1'), 1);
    forgetSyncAccount('u1');
    assert.equal(data.has('ucas-sync-u1'), false);
    assert.deepEqual(JSON.parse(data.get('ucas-owed-u1')), {
      del: { r1: { name: '' } },
      up: { r2: true },
    });
    assert.ok(data.has('ucas-sync-u2'), 'other accounts untouched');
    assert.equal(owedDeleteCount('u2'), 0);
  } finally {
    delete globalThis.localStorage;
  }
});

test('device wipe clears every sync meta; owed deletions stay by id', () => {
  const data = fakeLocalStorage({
    'ucas-sync-u1': '{}',
    'ucas-sync-u2': '{}',
    'ucas-owed-u1': JSON.stringify({ del: { r1: { name: 'a.pdf' } }, up: { r2: true } }),
    'ucas-owed-u2': JSON.stringify({ del: {}, up: { r3: true } }),
    'ucas-owed-device': JSON.stringify({ account: 'u1' }),
    'ucas-cloud-auth': 'x',
  });
  try {
    clearSyncMeta();
    assert.deepEqual([...data.keys()].sort(), [
      'ucas-cloud-auth',
      'ucas-owed-device',
      'ucas-owed-u1',
    ]);
    assert.deepEqual(JSON.parse(data.get('ucas-owed-u1')), { del: { r1: { name: '' } }, up: {} });
  } finally {
    delete globalThis.localStorage;
  }
});

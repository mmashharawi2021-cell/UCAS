import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  validateNickname,
  normalizeInviteCode,
  formatInviteCode,
  inviteLink,
  readLaunchParams,
  validateMessage,
  friendlyError,
  urlBase64ToUint8Array,
  reminderRows,
} from '../js/lib/cloud.js';

test('nickname validation', () => {
  assert.deepEqual(validateNickname('  أحمد   GIS '), { ok: true, value: 'أحمد GIS' });
  assert.equal(validateNickname('a').ok, false);
  assert.equal(validateNickname('x'.repeat(31)).ok, false);
  assert.equal(validateNickname('<b>').ok, false);
});

test('invite codes: typed, dashed, lowercase and full links', () => {
  assert.equal(normalizeInviteCode('abcd-ef23'), 'ABCDEF23');
  assert.equal(normalizeInviteCode('https://x.github.io/UCAS/?join=ABCDEF23'), 'ABCDEF23');
  assert.equal(normalizeInviteCode('ABCDEF2'), null);
  assert.equal(normalizeInviteCode('ABCDEFO1'), null, 'O, I, 0, 1 are not in the alphabet');
  assert.equal(formatInviteCode('ABCDEF23'), 'ABCD-EF23');
  assert.equal(
    inviteLink('ABCDEF23', 'https://x.github.io/UCAS/?group=1#h'),
    'https://x.github.io/UCAS/?join=ABCDEF23',
  );
  assert.deepEqual(readLaunchParams('https://x/UCAS/?join=abcdef23'), {
    join: 'ABCDEF23',
    group: null,
  });
  assert.deepEqual(readLaunchParams('https://x/?group=not-a-uuid'), { join: null, group: null });
  const id = '0f8fad5b-d9cb-469f-a165-70867728950e';
  assert.equal(readLaunchParams(`https://x/?group=${id}`).group, id);
});

test('messages and errors', () => {
  assert.equal(validateMessage('   ').ok, false);
  assert.equal(validateMessage('x'.repeat(2001)).ok, false);
  assert.equal(validateMessage(' hi ').value, 'hi');
  assert.match(friendlyError({ code: 'anonymous_provider_disabled' }), /غير مفعّل/);
  assert.match(friendlyError({ message: 'slow down' }), /انتظر/);
  assert.match(friendlyError(new TypeError('Failed to fetch')), /اتصال/);
  assert.match(friendlyError({ message: 'invalid invite code' }), /رمز الدعوة/);
});

test('VAPID key decoding', () => {
  const key =
    'BJtii5gJYXjSV-q5HJqw0LBh7CK2ntHyS7Pq1SNuAxB3VlXUvsSLvnrrMBYYuCmPum7ivTmkCLcAYZIAcoushmQ';
  const bytes = urlBase64ToUint8Array(key);
  assert.equal(bytes.length, 65);
  assert.equal(bytes[0], 4, 'uncompressed P-256 point');
});

test('push reminder rows: next two weeks only, lead time, stable keys', () => {
  const now = new Date(2026, 9, 28, 10, 0);
  const rows = reminderRows({
    now,
    leadMinutes: 60,
    courseName: () => 'قواعد البيانات',
    tasks: [
      { id: 't1', title: 'تقرير', due: new Date(2026, 9, 30, 23, 0).toISOString() },
      { id: 't2', title: 'منجز', due: new Date(2026, 9, 30).toISOString(), done: true },
      { id: 't3', title: 'بعيد', due: new Date(2026, 11, 30).toISOString() },
      { id: 't4', title: 'فات', due: new Date(2026, 9, 27).toISOString() },
    ],
    exams: [
      { id: 'e1', title: 'نصفي', courseId: 'c', date: new Date(2026, 10, 3, 9).toISOString() },
    ],
    schedule: [{ id: 's1', courseId: 'c', day: 0, start: '08:00', end: '09:00', room: 'B1' }],
  });
  const titles = rows.map(r => r.title);
  assert.ok(titles.includes('موعد تسليم: تقرير'));
  assert.ok(!titles.some(t => t.includes('منجز') || t.includes('بعيد') || t.includes('فات')));
  assert.ok(titles.includes('امتحان: نصفي') && titles.includes('غدًا امتحان: نصفي'));
  assert.equal(rows.filter(r => r.title.startsWith('محاضرة')).length, 2, 'two Sundays in 14 days');
  const task = rows.find(r => r.title === 'موعد تسليم: تقرير');
  assert.equal(new Date(task.fire_at).getTime(), new Date(2026, 9, 30, 22, 0).getTime());
  assert.equal(new Set(rows.map(r => r.local_key)).size, rows.length);
});

test('no server secrets in browser code', () => {
  const walk = dir =>
    readdirSync(dir, { withFileTypes: true }).flatMap(e =>
      e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
    );
  for (const file of [...walk('js'), 'sw.js', 'index.html']) {
    const src = readFileSync(file, 'utf8');
    assert.doesNotMatch(src, /sb_secret_|service_role|SERVICE_ROLE/i, file);
    // Legacy JWT keys: refuse anything that decodes to a service_role token.
    for (const jwt of src.match(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g) || []) {
      const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
      assert.notEqual(payload.role, 'service_role', file);
    }
  }
});

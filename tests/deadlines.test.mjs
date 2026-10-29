import test from 'node:test';
import assert from 'node:assert/strict';
import { attentionCount, dueLabel, groupTasks } from '../js/lib/deadlines.js';

const now = new Date('2026-11-01T10:00:00');
const at = (id, due, done = false) => ({ id, due, done });

test('tasks are grouped by how soon they are due; done and undated stay apart', () => {
  const g = groupTasks(
    [
      at('late', '2026-10-30T23:59'),
      at('today', '2026-11-01T23:59'),
      at('in2', '2026-11-03T09:00'),
      at('in10', '2026-11-11T09:00'),
      at('in20', '2026-11-21T09:00'),
      at('nodate', ''),
      at('bad', 'not a date'),
      at('submitted', '2026-11-02T09:00', true),
    ],
    now,
  );
  const ids = list => list.map(t => t.id);
  assert.deepEqual(ids(g.overdue), ['late']);
  assert.deepEqual(ids(g.urgent), ['today', 'in2']);
  assert.deepEqual(ids(g.soon), ['in10']);
  assert.deepEqual(ids(g.later), ['in20']);
  assert.deepEqual(ids(g.undated), ['nodate', 'bad']);
  assert.deepEqual(ids(g.done), ['submitted']);
  assert.equal(attentionCount([at('a', '2026-10-30T10:00'), at('b', '2026-11-05T10:00')], now), 2);
});

test('due labels count calendar days in Arabic', () => {
  assert.equal(dueLabel('2026-10-31T23:00', now), 'متأخر يومًا');
  assert.equal(dueLabel('2026-10-30T23:00', now), 'متأخر يومين');
  assert.equal(dueLabel('2026-10-25T23:00', now), 'متأخر 7 أيام');
  assert.equal(dueLabel('2026-11-01T15:30', now), 'اليوم · بعد 5 ساعة');
  assert.equal(dueLabel('2026-11-02T08:00', now), 'غدًا');
  assert.equal(dueLabel('2026-11-03T08:00', now), 'بعد يومين');
  assert.equal(dueLabel('2026-11-08T08:00', now), 'بعد 7 أيام');
  assert.equal(dueLabel('2026-11-20T08:00', now), 'بعد 19 يومًا');
  assert.equal(dueLabel('', now), 'بدون موعد');
});

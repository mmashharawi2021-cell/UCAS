import test from 'node:test';
import assert from 'node:assert/strict';
import { parseICS } from '../js/ics.js';

test('parses simple Moodle-style ICS events', () => {
  const text = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:ucas-test-100\r\nSUMMARY:GIS Exam\r\nDTSTART:20261102T090000\r\nDTEND:20261102T103000\r\nEND:VEVENT\r\nEND:VCALENDAR`;
  const events = parseICS(text);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, 'ucas-test-100');
  assert.equal(events[0].title, 'GIS Exam');
  assert.equal(events[0].date, '2026-11-02T09:00:00');
});
test('unfolds long ICS lines and flags unexpanded recurring events', () => {
  const events = parseICS(
    'BEGIN:VEVENT\nUID:test-2\nSUMMARY:Long\n  title\nDTSTART:20261103\nRRULE:FREQ=WEEKLY;COUNT=4\nEND:VEVENT',
  );
  assert.equal(events[0].title, 'Long title');
  assert.equal(events[0].recurring, true);
});
test('skips VEVENT records without start date', () => {
  assert.equal(parseICS('BEGIN:VEVENT\nSUMMARY:No date\nEND:VEVENT').length, 0);
});

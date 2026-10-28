// Build an .ics calendar (RFC 5545) so deadlines, exams and lectures get real reminders
// from the phone's own calendar app — they work even when this site is closed.
import { toMinutes } from './timetable.js?v=1.3.0';

const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

export function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
}

/** Fold lines longer than 75 octets (UTF-8 aware) as the spec requires. */
export function foldLine(line) {
  const encoder = new TextEncoder();
  const out = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    if (size + bytes > (out.length ? 74 : 75)) {
      out.push(current);
      current = '';
      size = 0;
    }
    current += ch;
    size += bytes;
  }
  out.push(current);
  return out.join('\r\n ');
}

function utc(date) {
  return new Date(date)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
}

/** Local floating time (no Z): lectures stay at the same wall-clock time. */
function local(date) {
  const d = new Date(date);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}

function alarm(minutes, title) {
  if (!(minutes > 0)) return [];
  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(title)}`,
    `TRIGGER:-PT${Math.round(minutes)}M`,
    'END:VALARM',
  ];
}

function event({ uid, start, end, title, description, location, rrule, floating, alarmMinutes }) {
  const fmt = floating ? local : utc;
  return [
    'BEGIN:VEVENT',
    `UID:${uid}@ucas-bridge`,
    `DTSTAMP:${utc(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${escapeText(title)}`,
    ...(description ? [`DESCRIPTION:${escapeText(description)}`] : []),
    ...(location ? [`LOCATION:${escapeText(location)}`] : []),
    ...(rrule ? [`RRULE:${rrule}`] : []),
    ...alarm(alarmMinutes, title),
    'END:VEVENT',
  ];
}

/** First date on/after `from` that falls on weekday `day`. */
export function firstWeekday(from, day) {
  const d = new Date(from);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((day - d.getDay() + 7) % 7));
  return d;
}

/**
 * options: { tasks, exams, schedule, courseName(id), alarmMinutes, semesterEnd (Date|string) }
 * Returns the .ics text and how many events it contains.
 */
export function buildCalendar(options) {
  const {
    tasks = [],
    exams = [],
    schedule = [],
    courseName = () => '',
    alarmMinutes = 60,
    semesterEnd = null,
    now = new Date(),
  } = options;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//UCAS Academic Bridge//AR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:UCAS Academic Bridge',
  ];
  let count = 0;
  const nowMs = new Date(now).getTime();

  for (const t of tasks) {
    if (t.done || !t.due) continue;
    const start = new Date(t.due);
    if (!Number.isFinite(start.getTime()) || start.getTime() < nowMs) continue;
    lines.push(
      ...event({
        uid: `task-${t.id}`,
        start,
        end: new Date(start.getTime() + 30 * 60000),
        title: `تسليم: ${t.title}`,
        description: courseName(t.courseId),
        alarmMinutes,
      }),
    );
    count++;
  }

  for (const e of exams) {
    const start = new Date(e.date);
    if (!Number.isFinite(start.getTime()) || start.getTime() < nowMs) continue;
    const duration = Number(e.duration) > 0 ? Number(e.duration) : 60;
    lines.push(
      ...event({
        uid: `exam-${e.id}`,
        start,
        end: new Date(start.getTime() + duration * 60000),
        title: `امتحان: ${e.title}`,
        description: courseName(e.courseId),
        location: e.room,
        // Exams deserve an earlier heads-up: the chosen reminder plus one day before.
        alarmMinutes: Math.max(alarmMinutes, 24 * 60),
      }),
    );
    count++;
  }

  const until = semesterEnd ? new Date(semesterEnd) : null;
  if (until && Number.isFinite(until.getTime())) {
    until.setHours(23, 59, 59, 0);
    for (const s of schedule) {
      const startMin = toMinutes(s.start);
      const endMin = toMinutes(s.end);
      if (Number.isNaN(startMin) || Number.isNaN(endMin)) continue;
      const first = firstWeekday(now, s.day);
      if (first > until) continue;
      const start = new Date(first);
      start.setHours(Math.floor(startMin / 60), startMin % 60, 0, 0);
      const end = new Date(first);
      end.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
      lines.push(
        ...event({
          uid: `slot-${s.id}`,
          start,
          end,
          title: courseName(s.courseId) || 'محاضرة',
          location: s.room,
          rrule: `FREQ=WEEKLY;BYDAY=${BYDAY[s.day]};UNTIL=${utc(until)}`,
          floating: true,
          alarmMinutes: Math.min(alarmMinutes, 30),
        }),
      );
      count++;
    }
  }

  lines.push('END:VCALENDAR');
  return { text: lines.map(foldLine).join('\r\n') + '\r\n', count };
}

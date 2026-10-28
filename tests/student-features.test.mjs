import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toMinutes,
  validateSlot,
  conflictsWith,
  todaySlots,
  nextSlot,
  weeklyMinutesByCourse,
} from '../js/lib/timetable.js';
import {
  weekRange,
  minutesByCourse,
  streakDays,
  clock,
  formatMinutes,
  validTimer,
} from '../js/lib/focus.js';
import {
  questionKey,
  applyAnswer,
  reviewUpdatesFromQuiz,
  dueReviews,
  MASTERED_BOX,
} from '../js/lib/review.js';
import {
  parseQuestions,
  parseQuestionText,
  parseQuestionCSV,
  answerIndex,
} from '../js/lib/question-import.js';
import { courseResult, courseMark, gpa, rating, neededForTarget } from '../js/lib/grades.js';
import { countdown, countdownLabel, urgency, upcomingExams } from '../js/lib/countdown.js';
import { buildCalendar, foldLine, escapeText } from '../js/lib/ics-export.js';
import { buildPack, readPack } from '../js/lib/pack.js';
import { weeklyReport, reportText } from '../js/lib/report.js';

// Wednesday 28 Oct 2026, 10:30 local time
const NOW = new Date(2026, 9, 28, 10, 30);

test('timetable: validation, conflicts, today and next slot', () => {
  assert.equal(toMinutes('08:30'), 510);
  assert.ok(Number.isNaN(toMinutes('8:3')));
  assert.equal(
    validateSlot({ courseId: 'c', day: 3, start: '10:00', end: '09:00' }),
    'يجب أن يكون وقت النهاية بعد وقت البداية',
  );
  assert.equal(validateSlot({ courseId: 'c', day: 3, start: '09:00', end: '10:00' }), '');
  const slots = [
    { id: 'a', courseId: 'c1', day: 3, start: '08:00', end: '09:30' },
    { id: 'b', courseId: 'c2', day: 3, start: '10:00', end: '11:30' },
    { id: 'c', courseId: 'c1', day: 3, start: '12:00', end: '13:00' },
    { id: 'd', courseId: 'c2', day: 0, start: '09:00', end: '10:00' },
  ];
  assert.deepEqual(
    conflictsWith(slots, { id: 'x', day: 3, start: '09:00', end: '10:30' }).map(s => s.id),
    ['a', 'b'],
  );
  assert.deepEqual(
    todaySlots(slots, NOW).map(s => s.status),
    ['done', 'now', 'upcoming'],
  );
  assert.equal(nextSlot(slots, NOW).slot.id, 'c');
  const late = new Date(2026, 9, 28, 20, 0);
  const next = nextSlot(slots, late);
  assert.equal(next.slot.id, 'd');
  assert.equal(next.at.getDay(), 0);
  assert.deepEqual(weeklyMinutesByCourse(slots), { c1: 150, c2: 150 });
});

test('focus: week range starts Saturday, totals, streak, clock', () => {
  const { start, end } = weekRange(NOW);
  assert.equal(start.getDay(), 6);
  assert.equal(Math.round((end - start) / 86400000), 7);
  const sessions = [
    { courseId: 'c1', minutes: 25, startedAt: new Date(2026, 9, 28, 9).toISOString() },
    { courseId: 'c1', minutes: 25, startedAt: new Date(2026, 9, 27, 9).toISOString() },
    { courseId: 'c2', minutes: 50, startedAt: new Date(2026, 9, 26, 9).toISOString() },
    { courseId: 'c2', minutes: 5, kind: 'short', startedAt: NOW.toISOString() },
    { courseId: 'c2', minutes: 99, startedAt: new Date(2026, 9, 10).toISOString() },
  ];
  assert.deepEqual(minutesByCourse(sessions, weekRange(NOW)), {
    byCourse: { c1: 50, c2: 50 },
    total: 100,
  });
  assert.equal(streakDays(sessions, NOW), 3);
  assert.equal(clock(65000), '01:05');
  assert.equal(formatMinutes(135), '2 س 15 د');
  assert.ok(validTimer({ mode: 'focus', startedAt: 1, endsAt: 1500001 }));
  assert.ok(!validTimer({ mode: 'nope', startedAt: 1, endsAt: 2 }));
});

test('review: wrong answers enter, right answers advance, mastered leaves', () => {
  const q = { question: 'ما المفتاح الأساسي؟', choices: ['أ', 'ب'], answer: 0 };
  assert.equal(questionKey(q), questionKey({ ...q, question: '  ما   المفتاح الأساسي؟ ' }));
  const updates = reviewUpdatesFromQuiz([], [q, { ...q, question: 'سؤال آخر' }], [1, 0], 'c1', NOW);
  assert.equal(updates.length, 1, 'only the wrong answer is added');
  assert.equal(updates[0].box, 0);
  assert.equal(dueReviews(updates, NOW).length, 1);
  let record = updates[0];
  for (let i = 0; i < MASTERED_BOX; i++) record = applyAnswer(record, q, 'c1', true, NOW);
  assert.equal(record.box, MASTERED_BOX);
  assert.equal(dueReviews([record], new Date(2027, 0, 1)).length, 0);
  record = applyAnswer(record, q, 'c1', false, NOW);
  assert.equal(record.box, 0);
  assert.equal(record.wrong, 2);
});

test('question import: Arabic text blocks and CSV', () => {
  const text = `س: ما هو المفتاح الأساسي؟
أ) حقل فريد
ب) جدول
ج) فهرس
د) نوع بيانات
الإجابة: أ
التفسير: يعرّف كل سجل

2. ما وحدة قياس الدقة المكانية؟
أ) البكسل
ب) المتر
الإجابة: ب

س: سؤال ناقص
أ) خيار واحد`;
  const r = parseQuestionText(text);
  assert.equal(r.questions.length, 2);
  assert.equal(r.questions[0].answer, 0);
  assert.equal(r.questions[0].why, 'يعرّف كل سجل');
  assert.equal(r.questions[1].answer, 1);
  assert.equal(r.errors.length, 1);
  const csv =
    'question,a,b,c,d,answer,why\n"GIS, اختصار؟",نظم معلومات جغرافية,شيء آخر,,,A,تعريف\nسؤال,x,y,,,9,\n';
  const c = parseQuestionCSV(csv);
  assert.equal(c.questions.length, 1);
  assert.equal(c.questions[0].question, 'GIS, اختصار؟');
  assert.equal(c.questions[0].choices.length, 2);
  assert.equal(c.errors.length, 1);
  assert.equal(parseQuestions(csv, 'bank.csv').questions.length, 1);
  assert.equal(answerIndex('ج'), 2);
  assert.equal(answerIndex('4'), 3);
});

test('grades: components, final mark, GPA, rating, needed', () => {
  const comps = [
    { name: 'أعمال', weight: 20, score: 18, max: 20 },
    { name: 'نصفي', weight: 30, score: 24, max: 30 },
    { name: 'نهائي', weight: 50, score: '', max: 50 },
  ];
  const partial = courseResult(comps);
  assert.equal(partial.earned, 42);
  assert.equal(partial.complete, false);
  assert.equal(partial.percent, 84);
  assert.equal(courseMark({ components: comps }), null);
  assert.equal(neededForTarget(comps, 90), 96);
  assert.equal(neededForTarget(comps, 99), null);
  comps[2].score = 40;
  assert.equal(courseMark({ components: comps }), 82);
  assert.equal(courseMark({ finalMark: 77, components: comps }), 77);
  const g = gpa([{ hours: 3, finalMark: 90 }, { hours: 2, finalMark: 70 }, { hours: 3 }], {
    hours: 30,
    average: 80,
  });
  assert.equal(g.semester, 82);
  assert.equal(g.semesterHours, 5);
  assert.equal(g.cumulative, 80.29);
  assert.equal(rating(91), 'ممتاز');
  assert.equal(rating(59), 'راسب');
  assert.equal(rating(55, 50), 'مقبول');
});

test('countdown labels and ordering', () => {
  const in3 = new Date(NOW.getTime() + 3 * 86400000 + 3600000);
  assert.equal(countdown(in3, NOW).days, 3);
  assert.equal(countdownLabel(in3, NOW), 'بعد 3 يوم');
  assert.equal(urgency(in3, NOW), 'soon');
  assert.equal(urgency(new Date(NOW.getTime() - 1000), NOW), 'past');
  assert.deepEqual(
    upcomingExams(
      [
        { date: in3.toISOString() },
        { date: '2020-01-01' },
        { date: new Date(NOW.getTime() + 86400000).toISOString() },
      ],
      NOW,
    ).length,
    2,
  );
});

test('ics export: escaping, folding, alarms, weekly lectures', () => {
  assert.equal(escapeText('a,b;c\nd'), 'a\\,b\\;c\\nd');
  const long = 'SUMMARY:' + 'ع'.repeat(80);
  assert.ok(
    foldLine(long)
      .split('\r\n ')
      .every(part => new TextEncoder().encode(part).length <= 75),
  );
  const { text, count } = buildCalendar({
    now: NOW,
    tasks: [
      { id: 't1', title: 'تقرير', due: new Date(2026, 10, 2, 23).toISOString(), done: false },
      { id: 't2', title: 'منجز', due: new Date(2026, 10, 2).toISOString(), done: true },
    ],
    exams: [
      { id: 'e1', title: 'نصفي', date: new Date(2026, 10, 10, 9).toISOString(), duration: 90 },
    ],
    schedule: [{ id: 's1', courseId: 'c1', day: 0, start: '08:00', end: '09:30', room: 'B12' }],
    semesterEnd: '2027-01-15',
    courseName: () => 'قواعد البيانات',
    alarmMinutes: 60,
  });
  assert.equal(count, 3);
  assert.match(text, /^BEGIN:VCALENDAR\r\n/);
  assert.match(text, /RRULE:FREQ=WEEKLY;BYDAY=SU;UNTIL=/);
  assert.match(text, /TRIGGER:-PT60M/);
  assert.match(text, /TRIGGER:-PT1440M/);
  assert.match(text, /DTSTART:20261101T080000\r\n/);
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 3);
});

test('course pack: round trip, validation and sanitising', () => {
  const pack = buildPack({
    course: { title: 'بناء قواعد البيانات' },
    notes: [{ title: 'ملخص 1', body: 'نص', color: 'yellow', private: 'x' }],
    questions: [{ question: 'س؟', choices: ['1', '2'], answer: 1 }],
    schedule: [{ day: 1, start: '08:00', end: '09:00' }],
    exams: [{ title: 'نهائي', date: '2027-01-10T09:00', type: 'final' }],
  });
  assert.equal(pack.notes[0].private, undefined);
  const read = readPack(JSON.parse(JSON.stringify(pack)));
  assert.equal(read.courseTitle, 'بناء قواعد البيانات');
  assert.equal(read.notes.length, 1);
  assert.equal(read.questions[0].answer, 1);
  assert.equal(read.schedule.length, 1);
  assert.equal(read.exams.length, 1);
  const bad = readPack({
    ...pack,
    notes: [{ title: '<img src=x>', color: 'javascript:' }],
    questions: [{ question: 'x', choices: ['a'], answer: 0 }],
    schedule: [{ day: 9, start: '25:00', end: '26:00' }],
  });
  assert.equal(bad.notes[0].color, '');
  assert.equal(bad.questions.length, 0);
  assert.equal(bad.schedule.length, 0);
  assert.throws(() => readPack({ format: 'other' }));
});

test('weekly report counts this week only', () => {
  const r = weeklyReport(
    {
      courses: [{ id: 'c1', title: 'مساق' }],
      tasks: [
        {
          done: true,
          doneAt: new Date(2026, 9, 27).toISOString(),
          due: new Date(2026, 9, 29).toISOString(),
        },
        { done: false, due: new Date(2026, 9, 20).toISOString() },
      ],
      attempts: [
        { courseId: 'c1', correct: 4, total: 5, date: new Date(2026, 9, 26).toISOString() },
      ],
      sessions: [
        { courseId: 'c1', minutes: 25, startedAt: new Date(2026, 9, 28, 9).toISOString() },
      ],
      notes: [{ courseId: 'c1', updatedAt: new Date(2026, 9, 25).toISOString() }],
      exams: [{ title: 'نصفي', courseId: 'c1', date: new Date(2026, 10, 3).toISOString() }],
    },
    NOW,
  );
  assert.equal(r.studyMinutes, 25);
  assert.equal(r.tasksDone, 1);
  assert.equal(r.overdue.length, 1);
  assert.equal(r.average, 80);
  assert.equal(r.notes, 1);
  assert.equal(r.examsAhead.length, 1);
  assert.equal(r.perCourse[0].minutes, 25);
  assert.match(
    reportText(r, () => 'مساق'),
    /وقت المذاكرة: 25 دقيقة/,
  );
});

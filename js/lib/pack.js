// Course packs: share notes, questions, timetable and exam dates of one course with a
// classmate as a small JSON file (WhatsApp, Drive, Bluetooth…). No server involved.
// Personal data (files, marks, quiz history, study time) is never included.

export const PACK_FORMAT = 'ucas-course-pack';
export const PACK_VERSION = 1;
const LIMITS = { notes: 300, questions: 500, schedule: 30, exams: 30, text: 20000 };

const str = (v, max = 500) => String(v ?? '').slice(0, max);

export function buildPack({ course, notes = [], questions = [], schedule = [], exams = [] }) {
  return {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    createdAt: new Date().toISOString(),
    course: { title: str(course?.title, 200) },
    notes: notes.map(n => ({
      title: str(n.title, 200),
      body: str(n.body, LIMITS.text),
      color: str(n.color, 20),
      lecture: str(n.lecture, 200),
    })),
    questions: questions.map(q => ({
      question: str(q.question, 600),
      choices: (q.choices || []).slice(0, 4).map(c => str(c, 300)),
      answer: Number(q.answer),
      why: str(q.why, 600),
      source: str(q.source, 200),
    })),
    schedule: schedule.map(s => ({
      day: s.day,
      start: str(s.start, 5),
      end: str(s.end, 5),
      room: str(s.room, 100),
      type: str(s.type, 20),
    })),
    exams: exams.map(e => ({
      title: str(e.title, 200),
      type: str(e.type, 20),
      date: str(e.date, 40),
      duration: Number(e.duration) || null,
      room: str(e.room, 100),
    })),
  };
}

/**
 * Validate an untrusted pack. Returns clean arrays ready to save (without ids) or throws
 * an Arabic error. Everything is treated as plain text by the UI.
 */
export function readPack(data) {
  if (!data || data.format !== PACK_FORMAT || data.version !== PACK_VERSION)
    throw new Error('الملف ليس حزمة مساق صالحة');
  const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
  const notes = arr(data.notes, LIMITS.notes)
    .filter(n => n && (n.title || n.body))
    .map(n => ({
      title: str(n.title, 200) || 'ملاحظة',
      body: str(n.body, LIMITS.text),
      color: ['yellow', 'green', 'blue', 'pink', ''].includes(n.color) ? n.color : '',
      lecture: str(n.lecture, 200),
    }));
  const questions = arr(data.questions, LIMITS.questions)
    .filter(
      q =>
        q &&
        q.question &&
        Array.isArray(q.choices) &&
        q.choices.length >= 2 &&
        Number.isInteger(q.answer) &&
        q.answer >= 0 &&
        q.answer < Math.min(4, q.choices.length),
    )
    .map(q => ({
      question: str(q.question, 600),
      choices: q.choices.slice(0, 4).map(c => str(c, 300)),
      answer: q.answer,
      why: str(q.why, 600),
      source: str(q.source, 200),
    }));
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  const schedule = arr(data.schedule, LIMITS.schedule)
    .filter(
      s =>
        s &&
        Number.isInteger(s.day) &&
        s.day >= 0 &&
        s.day <= 6 &&
        time.test(s.start) &&
        time.test(s.end),
    )
    .map(s => ({
      day: s.day,
      start: s.start,
      end: s.end,
      room: str(s.room, 100),
      type: str(s.type, 20),
    }));
  const exams = arr(data.exams, LIMITS.exams)
    .filter(e => e && e.title && Number.isFinite(new Date(e.date).getTime()))
    .map(e => ({
      title: str(e.title, 200),
      type: str(e.type, 20),
      date: str(e.date, 40),
      duration: Number(e.duration) > 0 ? Math.min(Number(e.duration), 600) : null,
      room: str(e.room, 100),
    }));
  return { courseTitle: str(data.course?.title, 200), notes, questions, schedule, exams };
}

/** Keys used to skip duplicates when importing a pack twice. */
export const dedupeKey = {
  note: n => `${n.title}\u0000${n.body}`,
  question: q => String(q.question).trim(),
  slot: s => `${s.day}-${s.start}-${s.end}`,
  exam: e => `${e.title}\u0000${e.date}`,
};

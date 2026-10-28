// Semesters: the student's current UCAS plan, archiving a finished term, and the
// cumulative average across archived terms. Pure helpers.
import { courseMark, gpa, round } from './grades.js?v=1.7.0';

/** Fall 2026/2027 registration (19 credit hours) with 55 hours passed before it. */
export const UCAS_FALL_2026 = {
  key: 'ucas-fall-2026',
  name: 'الفصل الأول 2026/2027',
  previousHours: 55,
  courses: [
    { code: 'GISS 2307', title: 'بناء قواعد البيانات الجغرافية', hours: 3 },
    { code: 'COMP 2319', title: 'مقدمة في لغة البرمجة', hours: 3 },
    { code: 'GISS 3302', title: 'تخطيط الخدمات المجتمعية والبنية التحتية', hours: 3 },
    { code: 'GISS 3315', title: 'تطبيقات الاستشعار عن بعد', hours: 3 },
    { code: 'GISS 4301', title: 'إدارة مشاريع نظم المعلومات الجغرافية', hours: 3 },
    { code: 'UNIB 1215', title: 'العمل الحر', hours: 2 },
    { code: 'UNIB 1204', title: 'ريادة الأعمال', hours: 2 },
  ],
};

const norm = s =>
  String(s || '')
    .replace(/[ً-ْ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();

/** Find a stored course by exact (normalised) title. */
export function matchCourse(courses, title) {
  const t = norm(title);
  return (courses || []).find(c => norm(c.title) === t) || null;
}

export const COURSE_CODE = /^[A-Z]{2,5}\s?\d{3,4}$/;

export function normalizeCode(value) {
  const v = String(value || '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
  const m = /^([A-Z]{2,5})\s?(\d{3,4})$/.exec(v);
  return m ? `${m[1]} ${m[2]}` : '';
}

/** Snapshot of a finished term: every course with its hours and final mark (if known). */
export function semesterSummary(name, courses, grades, now = new Date()) {
  const entries = courses.map(c => {
    const g = grades.find(x => x.id === c.id) || {};
    return {
      courseId: c.id,
      title: c.title,
      code: c.code || '',
      hours: Number(g.hours) || 0,
      mark: courseMark(g),
    };
  });
  const result = gpa(entries.map(e => ({ hours: e.hours, finalMark: e.mark ?? '' })));
  return {
    id: `sem-${now.getTime()}`,
    name: String(name || '').trim() || 'فصل دراسي',
    endedAt: now.toISOString(),
    hours: result.semesterHours,
    average: result.semester,
    courses: entries,
  };
}

/**
 * Previous record used for the cumulative average: the hours/average entered by the
 * student (before using the app) plus every archived semester that has an average.
 */
export function combinedPrevious(entered = {}, history = []) {
  const avg = entered.average;
  const base =
    Number(entered.hours) > 0 &&
    avg !== '' &&
    avg !== null &&
    avg !== undefined &&
    Number.isFinite(Number(avg));
  let hours = base ? Number(entered.hours) : 0;
  let points = base ? Number(entered.average) * hours : 0;
  for (const s of history || []) {
    if (!(s.hours > 0) || s.average === null || s.average === undefined) continue;
    hours += s.hours;
    points += s.average * s.hours;
  }
  return { hours, average: hours ? round(points / hours) : '' };
}

/** Total passed hours: entered previous hours + archived hours (marks permitting). */
export function passedHours(entered = {}, history = [], passMark = 60) {
  let total = Number(entered.hours) || 0;
  for (const s of history || [])
    for (const c of s.courses || []) if (c.mark !== null && c.mark >= passMark) total += c.hours;
  return total;
}

export function suggestNextSemester(name) {
  const m = /(الأول|الثاني|الصيفي)\s+(\d{4})\/(\d{4})/.exec(String(name || ''));
  if (!m) return '';
  if (m[1] === 'الأول') return `الفصل الثاني ${m[2]}/${m[3]}`;
  if (m[1] === 'الثاني') return `الفصل الصيفي ${m[2]}/${m[3]}`;
  return `الفصل الأول ${m[3]}/${Number(m[3]) + 1}`;
}

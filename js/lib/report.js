// Weekly study report (pure). Works on the plain arrays kept in app state.
import { inRange, minutesByCourse, weekRange, streakDays } from './focus.js?v=1.4.0';

export function weeklyReport(data, now = new Date(), offsetWeeks = 0) {
  const range = weekRange(now, offsetWeeks);
  const { tasks = [], attempts = [], sessions = [], notes = [], exams = [], courses = [] } = data;

  const study = minutesByCourse(sessions, range);
  const tasksDone = tasks.filter(t => t.done && t.doneAt && inRange(t.doneAt, range));
  const tasksDue = tasks.filter(t => t.due && inRange(t.due, range));
  const overdue = tasks.filter(
    t => !t.done && t.due && new Date(t.due).getTime() < Math.min(Date.now(), range.end.getTime()),
  );
  const weekAttempts = attempts.filter(a => inRange(a.date, range));
  const avg = weekAttempts.filter(a => a.total > 0);
  const average = avg.length
    ? Math.round(avg.reduce((s, a) => s + (a.correct / a.total) * 100, 0) / avg.length)
    : null;
  const notesWritten = notes.filter(n => inRange(n.updatedAt || n.createdAt, range));
  const next = new Date(range.end);
  next.setDate(next.getDate() + 7);
  const examsAhead = exams
    .filter(e => {
      const t = new Date(e.date).getTime();
      return t >= now.getTime() && t < next.getTime();
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const perCourse = courses
    .map(c => ({
      courseId: c.id,
      title: c.title,
      minutes: study.byCourse[c.id] || 0,
      attempts: weekAttempts.filter(a => a.courseId === c.id).length,
      notes: notesWritten.filter(n => n.courseId === c.id).length,
    }))
    .filter(c => c.minutes || c.attempts || c.notes);

  return {
    range,
    studyMinutes: study.total,
    perCourse,
    tasksDone: tasksDone.length,
    tasksDue: tasksDue.length,
    overdue,
    attempts: weekAttempts.length,
    average,
    notes: notesWritten.length,
    examsAhead,
    streak: offsetWeeks === 0 ? streakDays(sessions, now) : null,
  };
}

/** Plain-text summary for sharing (WhatsApp etc.). */
export function reportText(report, courseName = id => id) {
  const fmt = d => d.toLocaleDateString('ar', { day: 'numeric', month: 'long' });
  const end = new Date(report.range.end.getTime() - 86400000);
  const lines = [
    `📚 تقريري الدراسي الأسبوعي (${fmt(report.range.start)} – ${fmt(end)})`,
    `⏱️ وقت المذاكرة: ${Math.round(report.studyMinutes)} دقيقة`,
    `✅ تكليفات أُنجزت: ${report.tasksDone}`,
    `📝 اختبارات تدريبية: ${report.attempts}${report.average !== null ? ` (متوسط ${report.average}%)` : ''}`,
    `🗒️ ملاحظات: ${report.notes}`,
  ];
  if (report.overdue.length) lines.push(`⚠️ تكليفات متأخرة: ${report.overdue.length}`);
  for (const e of report.examsAhead)
    lines.push(`📅 امتحان قادم: ${e.title} — ${courseName(e.courseId)}`);
  return lines.join('\n');
}

// Exam countdown helpers (pure).

export const EXAM_TYPES = {
  quiz: 'كويز',
  midterm: 'امتحان نصفي',
  final: 'امتحان نهائي',
  practical: 'امتحان عملي',
  other: 'أخرى',
};

export function countdown(date, now = new Date()) {
  const ms = new Date(date).getTime() - new Date(now).getTime();
  if (!Number.isFinite(ms)) return null;
  const past = ms < 0;
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86400000);
  const hours = Math.floor((abs % 86400000) / 3600000);
  const minutes = Math.floor((abs % 3600000) / 60000);
  return { past, days, hours, minutes, ms };
}

export function countdownLabel(date, now = new Date()) {
  const c = countdown(date, now);
  if (!c) return '';
  if (c.past) return 'انتهى';
  if (c.days >= 2) return `بعد ${c.days} يوم`;
  if (c.days === 1) return `غدًا · بعد ${24 + c.hours} ساعة`;
  if (c.hours >= 1) return `اليوم · بعد ${c.hours} ساعة`;
  return `بعد ${c.minutes} دقيقة`;
}

/** Urgency level for styling: 'past' | 'urgent' (≤2 days) | 'soon' (≤7) | 'later'. */
export function urgency(date, now = new Date()) {
  const c = countdown(date, now);
  if (!c) return 'later';
  if (c.past) return 'past';
  if (c.ms <= 2 * 86400000) return 'urgent';
  if (c.ms <= 7 * 86400000) return 'soon';
  return 'later';
}

export function upcomingExams(exams, now = new Date()) {
  const t = new Date(now).getTime();
  return (exams || [])
    .filter(e => new Date(e.date).getTime() >= t)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

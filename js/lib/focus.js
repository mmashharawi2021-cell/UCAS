// Pomodoro / study-session helpers (pure).

export const PRESETS = {
  focus: { label: 'تركيز', minutes: 25 },
  short: { label: 'استراحة قصيرة', minutes: 5 },
  long: { label: 'استراحة طويلة', minutes: 15 },
};

/** Start of the week (Saturday 00:00, as the UCAS week starts on Saturday). */
export function weekStart(now = new Date(), firstDay = 6) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getDay() - firstDay + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

export function weekRange(now = new Date(), offsetWeeks = 0) {
  const start = weekStart(now);
  start.setDate(start.getDate() + offsetWeeks * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { start, end };
}

export function inRange(iso, { start, end }) {
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t >= start.getTime() && t < end.getTime();
}

/** Minutes studied per course inside a range, plus the total. */
export function minutesByCourse(sessions, range) {
  const byCourse = {};
  let total = 0;
  for (const s of sessions || []) {
    if (s.kind && s.kind !== 'focus') continue;
    if (range && !inRange(s.startedAt, range)) continue;
    const minutes = Math.max(0, Number(s.minutes) || 0);
    const key = s.courseId || '';
    byCourse[key] = (byCourse[key] || 0) + minutes;
    total += minutes;
  }
  return { byCourse, total };
}

/** Consecutive days (ending today or yesterday) with at least one focus session. */
export function streakDays(sessions, now = new Date()) {
  const days = new Set(
    (sessions || [])
      .filter(s => !s.kind || s.kind === 'focus')
      .map(s => new Date(s.startedAt))
      .filter(d => Number.isFinite(d.getTime()))
      .map(d => d.toDateString()),
  );
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function formatMinutes(total) {
  const m = Math.round(Number(total) || 0);
  if (m < 60) return `${m} د`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} س ${rest} د` : `${h} س`;
}

/** "MM:SS" for a remaining number of milliseconds. */
export function clock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Validate a stored running timer so a corrupted value never breaks the page. */
export function validTimer(timer) {
  return !!(
    timer &&
    PRESETS[timer.mode] &&
    Number.isFinite(timer.endsAt) &&
    Number.isFinite(timer.startedAt) &&
    timer.endsAt > timer.startedAt &&
    timer.endsAt - timer.startedAt <= 3 * 3600000
  );
}

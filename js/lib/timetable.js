// Weekly lecture timetable: pure helpers (no DOM, no storage).
// Days use JavaScript numbering: 0 = Sunday … 6 = Saturday.

export const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const SLOT_TYPES = { lecture: 'محاضرة', lab: 'عملي', tutorial: 'نقاش', other: 'أخرى' };

/** "HH:MM" → minutes since midnight, or NaN when invalid. */
export function toMinutes(value) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(value || '').trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}

export function fromMinutes(total) {
  const m = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Validate a slot; returns an Arabic error message or '' when valid. */
export function validateSlot(slot) {
  if (!slot || !slot.courseId) return 'اختر المساق';
  if (!Number.isInteger(slot.day) || slot.day < 0 || slot.day > 6) return 'اختر يومًا صحيحًا';
  const start = toMinutes(slot.start);
  const end = toMinutes(slot.end);
  if (Number.isNaN(start) || Number.isNaN(end)) return 'أدخل وقت البداية والنهاية بصيغة صحيحة';
  if (end <= start) return 'يجب أن يكون وقت النهاية بعد وقت البداية';
  if (end - start > 6 * 60) return 'مدة المحاضرة أطول من 6 ساعات';
  return '';
}

export function sortSlots(slots) {
  return (slots || [])
    .slice()
    .sort((a, b) => a.day - b.day || toMinutes(a.start) - toMinutes(b.start));
}

export function slotsForDay(slots, day) {
  return sortSlots((slots || []).filter(s => s.day === day));
}

/** Slots on the same day whose times overlap `slot` (excluding itself). */
export function conflictsWith(slots, slot) {
  const start = toMinutes(slot.start);
  const end = toMinutes(slot.end);
  return (slots || []).filter(
    s =>
      s.id !== slot.id &&
      s.day === slot.day &&
      toMinutes(s.start) < end &&
      start < toMinutes(s.end),
  );
}

/**
 * Today's slots with their status relative to `now`:
 * 'done' | 'now' | 'upcoming'.
 */
export function todaySlots(slots, now = new Date()) {
  const minutes = now.getHours() * 60 + now.getMinutes();
  return slotsForDay(slots, now.getDay()).map(s => {
    const start = toMinutes(s.start);
    const end = toMinutes(s.end);
    const status = minutes >= end ? 'done' : minutes >= start ? 'now' : 'upcoming';
    return { ...s, status, startsIn: start - minutes };
  });
}

/** The next slot (today or later this week), with the Date it starts. */
export function nextSlot(slots, now = new Date()) {
  const sorted = sortSlots(slots);
  if (!sorted.length) return null;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  for (let offset = 0; offset <= 7; offset++) {
    const day = (now.getDay() + offset) % 7;
    const candidate = sorted.find(
      s => s.day === day && (offset > 0 || toMinutes(s.start) > nowMinutes),
    );
    if (candidate) {
      const at = new Date(now);
      at.setDate(now.getDate() + offset);
      const start = toMinutes(candidate.start);
      at.setHours(Math.floor(start / 60), start % 60, 0, 0);
      return { slot: candidate, at };
    }
  }
  return null;
}

/** Total scheduled minutes per week for each course id. */
export function weeklyMinutesByCourse(slots) {
  const out = {};
  for (const s of slots || []) {
    const minutes = toMinutes(s.end) - toMinutes(s.start);
    if (minutes > 0) out[s.courseId] = (out[s.courseId] || 0) + minutes;
  }
  return out;
}

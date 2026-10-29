// Deadline groups for assignments (pure). Warnings cover the next two weeks; anything due
// within two days is urgent.
const DAY = 86400000;
export const URGENT_DAYS = 2;
export const WARN_DAYS = 14;

/** Time left until `due`, or null when the task has no usable date. */
function left(due, now) {
  const ms = new Date(due).getTime() - new Date(now).getTime();
  return due && Number.isFinite(ms) ? ms : null;
}

/** Split tasks into overdue, urgent (≤2 days), soon (≤14 days), later, undated and done. */
export function groupTasks(tasks, now = new Date()) {
  const groups = { overdue: [], urgent: [], soon: [], later: [], undated: [], done: [] };
  for (const t of tasks) {
    const ms = left(t.due, now);
    if (t.done) groups.done.push(t);
    else if (ms === null) groups.undated.push(t);
    else if (ms < 0) groups.overdue.push(t);
    else if (ms <= URGENT_DAYS * DAY) groups.urgent.push(t);
    else if (ms <= WARN_DAYS * DAY) groups.soon.push(t);
    else groups.later.push(t);
  }
  const byDue = (a, b) => String(a.due).localeCompare(String(b.due));
  for (const key of ['overdue', 'urgent', 'soon', 'later']) groups[key].sort(byDue);
  groups.done.sort((a, b) => String(b.due || '').localeCompare(String(a.due || '')));
  return groups;
}

/** Short Arabic label for the time left, e.g. "متأخر يومين"، "اليوم"، "غدًا"، "بعد 5 أيام". */
export function dueLabel(due, now = new Date()) {
  const ms = left(due, now);
  if (ms === null) return 'بدون موعد';
  const start = d => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x.getTime();
  };
  const days = Math.round((start(due) - start(now)) / DAY);
  if (ms < 0) {
    const late = Math.max(1, -days);
    return late === 1 ? 'متأخر يومًا' : late === 2 ? 'متأخر يومين' : `متأخر ${late} أيام`;
  }
  if (days === 0) {
    const hours = Math.floor(ms / 3600000);
    return hours >= 1 ? `اليوم · بعد ${hours} ساعة` : 'خلال أقل من ساعة';
  }
  if (days === 1) return 'غدًا';
  if (days === 2) return 'بعد يومين';
  return days <= 10 ? `بعد ${days} أيام` : `بعد ${days} يومًا`;
}

/** Number of open tasks needing attention: overdue or due within two weeks. */
export function attentionCount(tasks, now = new Date()) {
  const g = groupTasks(tasks, now);
  return g.overdue.length + g.urgent.length + g.soon.length;
}

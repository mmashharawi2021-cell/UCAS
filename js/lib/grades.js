// Grade book and GPA helpers (pure).
//
// Courses are graded out of 100 and the average is weighted by credit hours, the
// percentage system used by most Palestinian colleges. The pass mark and rating bands
// are settings because they differ between programmes — always confirm with the
// college's own regulations.

export const DEFAULT_PASS_MARK = 60;
export const RATINGS = [
  { min: 90, label: 'ممتاز' },
  { min: 80, label: 'جيد جدًا' },
  { min: 70, label: 'جيد' },
  { min: 60, label: 'مقبول' },
  { min: 0, label: 'راسب' },
];

export const DEFAULT_COMPONENTS = [
  { name: 'أعمال الفصل', weight: 20 },
  { name: 'الامتحان النصفي', weight: 30 },
  { name: 'الامتحان النهائي', weight: 50 },
];

const num = v => (v === '' || v === null || v === undefined ? NaN : Number(v));

/**
 * Course result from its components.
 * Each component: { name, weight (percent of course), score, max }.
 * Returns earned points so far, the weight entered, and the percentage of
 * the entered weight (a running estimate when not all marks are in).
 */
export function courseResult(components) {
  let earned = 0;
  let weightEntered = 0;
  let weightTotal = 0;
  for (const c of components || []) {
    const weight = num(c.weight);
    if (!(weight > 0)) continue;
    weightTotal += weight;
    const score = num(c.score);
    const max = num(c.max) > 0 ? num(c.max) : 100;
    if (Number.isNaN(score)) continue;
    earned += (Math.min(Math.max(score, 0), max) / max) * weight;
    weightEntered += weight;
  }
  return {
    earned: round(earned),
    weightEntered: round(weightEntered),
    weightTotal: round(weightTotal),
    complete: weightTotal > 0 && Math.abs(weightEntered - weightTotal) < 0.01,
    percent: weightEntered > 0 ? round((earned / weightEntered) * 100) : null,
  };
}

/** Final mark: an explicit final mark wins; otherwise the component result. */
export function courseMark(entry) {
  const explicit = num(entry?.finalMark);
  if (!Number.isNaN(explicit)) return round(Math.min(Math.max(explicit, 0), 100));
  const result = courseResult(entry?.components);
  return result.complete ? result.earned : null;
}

/** Points still needed in the remaining weight to reach `target` (null if impossible). */
export function neededForTarget(components, target) {
  const result = courseResult(components);
  const remaining = result.weightTotal - result.weightEntered;
  const need = target - result.earned;
  if (need <= 0) return 0;
  if (remaining <= 0 || need > remaining) return null;
  return round((need / remaining) * 100);
}

export function rating(mark, passMark = DEFAULT_PASS_MARK) {
  if (mark === null || mark === undefined || Number.isNaN(Number(mark))) return '';
  if (mark < passMark) return 'راسب';
  return RATINGS.find(r => mark >= r.min && r.min >= passMark)?.label || 'مقبول';
}

/**
 * Semester and cumulative weighted averages.
 * entries: [{ hours, ...gradeEntry }]; previous: { hours, average }.
 */
export function gpa(entries, previous = {}) {
  let points = 0;
  let hours = 0;
  for (const e of entries || []) {
    const h = num(e.hours);
    const mark = courseMark(e);
    if (!(h > 0) || mark === null) continue;
    points += mark * h;
    hours += h;
  }
  const semester = hours ? round(points / hours) : null;
  const prevHours = num(previous.hours) > 0 ? num(previous.hours) : 0;
  const prevAvg = num(previous.average);
  const cumulativeHours = hours + (Number.isNaN(prevAvg) ? 0 : prevHours);
  const cumulative = cumulativeHours
    ? round((points + (Number.isNaN(prevAvg) ? 0 : prevAvg * prevHours)) / cumulativeHours)
    : null;
  return { semester, semesterHours: hours, cumulative, cumulativeHours };
}

export function round(n) {
  return Math.round(n * 100) / 100;
}

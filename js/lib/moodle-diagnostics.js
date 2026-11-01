// Plain-language diagnosis of a Moodle file scan, one course at a time, from counts only.
// Works with the per-course report of Companion 0.3+ and, for older extensions, with the
// activity links that the metadata sync already saved locally.
const LABELS = {
  resource: 'ملف',
  folder: 'مجلد',
  page: 'صفحة',
  book: 'كتاب',
  url: 'رابط',
  forum: 'منتدى',
  assign: 'تكليف',
  quiz: 'اختبار',
  lesson: 'درس',
  choice: 'تصويت',
  h5pactivity: 'نشاط H5P',
};
// Activity types whose files the extension looks for.
const SCANNED = ['resource', 'folder', 'page', 'book'];
const count = v => (Number.isSafeInteger(v) && v >= 0 ? Math.min(v, 100000) : 0);
const counts = (value, key) =>
  Object.fromEntries(
    Object.entries(value && typeof value === 'object' ? value : {})
      .filter(([k]) => key.test(k))
      .slice(0, 30)
      .map(([k, v]) => [k, count(v)])
      .filter(([, v]) => v > 0),
  );

/** Validate the extension's per-course report (untrusted input) into a Map keyed by course id. */
export function normalizeScanReport(report) {
  const byCourse = new Map();
  if (!Array.isArray(report)) return byCourse;
  for (const entry of report.slice(0, 150)) {
    const courseId = String(entry?.courseId || '');
    if (!/^\d{1,12}$/.test(courseId) || byCourse.has(courseId)) continue;
    byCourse.set(courseId, {
      courseId,
      courseTitle: String(entry.courseTitle || '').slice(0, 150),
      files: count(entry.files),
      activities: counts(entry.activities, /^[a-z0-9_]{1,30}$/),
      pages: count(entry.pages),
      pageErrors: count(entry.pageErrors),
      unsupported: counts(entry.unsupported, /^\.[a-z0-9]{1,8}$/),
      untrusted: count(entry.untrusted),
      limited: entry.limited === true,
      error: typeof entry.error === 'string' ? entry.error.slice(0, 160) : '',
    });
  }
  return byCourse;
}

/** Count activity types in saved Moodle activity links (…/mod/<type>/view.php?id=…). */
export function activityTypesFromLinks(urls) {
  const out = {};
  for (const url of urls) {
    const kind = /\/mod\/([a-z0-9_]+)\/view\.php/.exec(String(url || ''))?.[1];
    if (kind) out[kind] = (out[kind] || 0) + 1;
  }
  return out;
}

const listed = activities =>
  Object.entries(activities)
    .map(([kind, n]) => `${LABELS[kind] || kind}: ${n}`)
    .join('، ');

/**
 * Reasons to show under a course in the scan report. `entry` is a normalized report entry, or
 * `{ files, activities, legacy: true }` when the installed extension sends no report.
 */
export function describeCourseScan(entry) {
  if (entry.error) return [`تعذر فحص المساق: ${entry.error}`];
  const lines = [];
  const activities = entry.activities || {};
  const scannable = SCANNED.reduce((sum, kind) => sum + (activities[kind] || 0), 0);
  if (Object.keys(activities).length)
    lines.push(`الأنشطة الظاهرة في صفحة المساق: ${listed(activities)}.`);
  if (!entry.files) {
    if (!Object.keys(activities).length)
      lines.push(
        'لم تظهر أنشطة في صفحة المساق. قد يعرض المساق أقسامه في صفحات منفصلة، أو لم يُضف إليه محتوى بعد.',
      );
    else if (!scannable)
      lines.push('لا يحتوي المساق موارد ملفات أو مجلدات أو صفحات أو كتبًا، وهي ما تفحصه الإضافة.');
    if (activities.url)
      lines.push(
        'الروابط تفتح مواقع خارجية مثل Google Drive، والإضافة لا تنزّل منها؛ افتحها من مكتبة المساق.',
      );
    if (activities.forum) lines.push('مرفقات المنتديات والإعلانات لا تُفحص حاليًا.');
    if (activities.assign) lines.push('مرفقات وصف التكليفات لا تُفحص حاليًا.');
    if (!entry.legacy && scannable && !entry.pageErrors)
      lines.push('فُحصت موارد المساق ولم يظهر فيها ملف بصيغة مدعومة.');
  }
  if (entry.pageErrors) lines.push(`تعذر فتح ${entry.pageErrors} من صفحات المحتوى أو المجلدات.`);
  const unsupported = Object.entries(entry.unsupported || {});
  if (unsupported.length)
    lines.push(
      `ملفات بصيغ غير مدعومة لم تُضف: ${unsupported.map(([ext, n]) => `${ext} (${n})`).join('، ')}.`,
    );
  if (entry.untrusted)
    lines.push(`روابط ملفات غير معتمدة تجاهلها الفحص لحمايتك: ${entry.untrusted}.`);
  if (entry.limited) lines.push('بلغ الفحص الحد الأقصى للعناصر في هذا المساق.');
  if (entry.legacy)
    lines.push('حدّث إضافة Companion إلى 0.3.0 لعرض تفاصيل الصفحات والملفات التي تجاوزها الفحص.');
  return lines;
}

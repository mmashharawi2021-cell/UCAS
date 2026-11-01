import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityTypesFromLinks,
  describeCourseScan,
  normalizeScanReport,
} from '../js/lib/moodle-diagnostics.js';

test('scan report from the extension is validated as untrusted counts', () => {
  const report = normalizeScanReport([
    {
      courseId: '821',
      courseTitle: 'GIS',
      files: 3,
      activities: { resource: 2, url: 1, 'bad key': 9, forum: -4 },
      unsupported: { '.rar': 2, 'rar<script>': 1 },
      pages: 1.5,
      untrusted: 1,
    },
    { courseId: '821', files: 99 },
    { courseId: 'x', files: 1 },
    null,
  ]);
  assert.deepEqual([...report.keys()], ['821']);
  const gis = report.get('821');
  assert.deepEqual(gis.activities, { resource: 2, url: 1 });
  assert.deepEqual(gis.unsupported, { '.rar': 2 });
  assert.equal(gis.pages, 0);
  assert.equal(gis.files, 3);
  assert.equal(normalizeScanReport('nope').size, 0);
});

test('courses without files explain what the page contains and what is not scanned', () => {
  const lines = describeCourseScan({
    files: 0,
    activities: { url: 3, forum: 1, assign: 2 },
    pageErrors: 0,
    unsupported: {},
  });
  assert.match(lines[0], /رابط: 3، منتدى: 1، تكليف: 2/);
  assert.ok(lines.some(l => /لا يحتوي المساق موارد ملفات/.test(l)));
  assert.ok(lines.some(l => /Google Drive/.test(l)));
  assert.ok(lines.some(l => /المنتديات/.test(l)));
  assert.ok(lines.some(l => /التكليفات/.test(l)));
});

test('scanned resources with skipped files, page errors and limits are reported', () => {
  const lines = describeCourseScan({
    files: 0,
    activities: { folder: 1 },
    pageErrors: 1,
    unsupported: { '.rar': 2 },
    untrusted: 1,
    limited: true,
  }).join('\n');
  assert.match(lines, /تعذر فتح 1/);
  assert.match(lines, /\.rar \(2\)/);
  assert.match(lines, /غير معتمدة/);
  assert.match(lines, /الحد الأقصى/);
  assert.deepEqual(describeCourseScan({ files: 0, activities: {} }).length, 1);
  assert.deepEqual(describeCourseScan({ error: 'تعذرت قراءة ملفات المساق' }), [
    'تعذر فحص المساق: تعذرت قراءة ملفات المساق',
  ]);
});

test('older extensions fall back to saved activity links and ask for an update', () => {
  const activities = activityTypesFromLinks([
    'https://moodle.ucas.edu.ps/mod/url/view.php?id=1',
    'https://moodle.ucas.edu.ps/mod/url/view.php?id=2',
    'https://moodle.ucas.edu.ps/mod/forum/view.php?id=3',
    'https://moodle.ucas.edu.ps/course/view.php?id=4',
    undefined,
  ]);
  assert.deepEqual(activities, { url: 2, forum: 1 });
  const lines = describeCourseScan({ files: 0, activities, legacy: true });
  assert.match(lines.at(-1), /0\.3\.0/);
  assert.ok(!lines.some(l => /فُحصت موارد المساق/.test(l)), 'legacy data cannot claim a scan');
});

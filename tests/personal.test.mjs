import test from 'node:test';
import assert from 'node:assert/strict';
import {
  UCAS_FALL_2026,
  matchCourse,
  normalizeCode,
  semesterSummary,
  combinedPrevious,
  passedHours,
  suggestNextSemester,
} from '../js/lib/semester.js';
import { highlight, splitFences } from '../js/lib/code-highlight.js';

test('Fall 2026/2027 plan: 7 courses, 19 hours, 55 previous', () => {
  assert.equal(UCAS_FALL_2026.courses.length, 7);
  assert.equal(
    UCAS_FALL_2026.courses.reduce((s, c) => s + c.hours, 0),
    19,
  );
  assert.equal(UCAS_FALL_2026.previousHours, 55);
  for (const c of UCAS_FALL_2026.courses) assert.equal(normalizeCode(c.code), c.code);
});

test('course matching and code normalisation', () => {
  const courses = [
    { id: 'c1', title: 'تطبيقات الاستشعار عن بعد' },
    { id: 'c2', title: 'إدارة مشاريع نظم المعلومات الجغرافية' },
  ];
  assert.equal(matchCourse(courses, 'تطبيقات  الاستشعار عن بعد').id, 'c1');
  assert.equal(
    matchCourse(courses, 'ادارة مشاريع نظم المعلومات الجغرافيه').id,
    'c2',
    'alef/taa marbuta variants',
  );
  assert.equal(matchCourse(courses, 'مساق آخر'), null);
  assert.equal(normalizeCode('giss2307'), 'GISS 2307');
  assert.equal(normalizeCode('comp  2319'), 'COMP 2319');
  assert.equal(normalizeCode('hello'), '');
});

test('archiving a semester and the cumulative average', () => {
  const courses = [
    { id: 'a', title: 'A', code: 'GISS 1001' },
    { id: 'b', title: 'B', code: 'UNIB 1002' },
    { id: 'c', title: 'C' },
  ];
  const grades = [
    { id: 'a', hours: '3', finalMark: '90' },
    { id: 'b', hours: '2', finalMark: '70' },
    { id: 'c', hours: '3' },
  ];
  const sem = semesterSummary('الفصل الأول 2026/2027', courses, grades, new Date(2027, 0, 30));
  assert.equal(sem.hours, 5);
  assert.equal(sem.average, 82);
  assert.equal(sem.courses.find(c => c.courseId === 'c').mark, null);
  const prev = combinedPrevious({ hours: 55, average: 80 }, [sem]);
  assert.equal(prev.hours, 60);
  assert.equal(prev.average, 80.17);
  assert.deepEqual(combinedPrevious({ hours: 55, average: '' }, []), { hours: 0, average: '' });
  assert.equal(passedHours({ hours: 55 }, [sem], 60), 60);
  assert.equal(suggestNextSemester('الفصل الأول 2026/2027'), 'الفصل الثاني 2026/2027');
  assert.equal(suggestNextSemester('الفصل الصيفي 2026/2027'), 'الفصل الأول 2027/2028');
});

test('code highlighting escapes everything and colours tokens', () => {
  const html = highlight(
    'def area(r):\n    # pi r²\n    return 3.14 * r ** 2  # "<b>"\nprint("<img src=x>")',
    'python',
  );
  assert.ok(!html.includes('<img') && !html.includes('<b>'), 'no raw HTML');
  assert.match(html, /<span class="tok-k">def<\/span>/);
  assert.match(html, /<span class="tok-c"># pi r²<\/span>/);
  assert.match(html, /<span class="tok-n">3\.14<\/span>/);
  assert.match(html, /<span class="tok-s">&quot;&lt;img src=x&gt;&quot;<\/span>/);
  assert.match(
    highlight('SELECT name FROM parcels -- note', 'sql'),
    /tok-k">SELECT[\s\S]*tok-c">-- note/,
  );
  assert.doesNotMatch(highlight('x = a -- b', 'python'), /tok-c/);
});

test('fenced code is split from prose', () => {
  const parts = splitFences('مقدمة\n```python\nx = 1\n```\nخاتمة\n```\nunclosed');
  assert.deepEqual(
    parts.map(p => p.type),
    ['text', 'code', 'text', 'code'],
  );
  assert.equal(parts[1].lang, 'python');
  assert.equal(parts[1].value, 'x = 1');
  assert.equal(parts[3].value, 'unclosed');
});

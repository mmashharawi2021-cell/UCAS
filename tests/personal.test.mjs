import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchCourse,
  normalizeCode,
  semesterSummary,
  combinedPrevious,
  passedHours,
  suggestNextSemester,
} from '../js/lib/semester.js';
import { highlight, splitFences } from '../js/lib/code-highlight.js';
import { LEGACY_PLAN } from './fixtures/legacy-seed.mjs';

// The plan is no longer shipped (2.0.0); the browser tests rebuild it as legacy data.
test('legacy plan fixture: 7 courses, 17 hours, 42 previous', () => {
  assert.equal(LEGACY_PLAN.courses.length, 7);
  assert.equal(
    LEGACY_PLAN.courses.reduce((s, c) => s + c.hours, 0),
    17,
  );
  assert.equal(LEGACY_PLAN.previousHours, 42);
  for (const c of LEGACY_PLAN.courses) assert.equal(normalizeCode(c.code), c.code);
});

test('course matching and code normalisation', () => {
  const courses = [
    { id: 'c1', title: 'أساسيات الفيزياء العامة' },
    { id: 'c2', title: 'مدخل إلى علم النفس' },
  ];
  assert.equal(matchCourse(courses, 'أساسيات  الفيزياء العامة').id, 'c1');
  assert.equal(matchCourse(courses, 'مدخل الى علم النفس').id, 'c2', 'alef/taa marbuta variants');
  assert.equal(matchCourse(courses, 'مساق آخر'), null);
  assert.equal(normalizeCode('test1101'), 'TEST 1101');
  assert.equal(normalizeCode('demo  2202'), 'DEMO 2202');
  assert.equal(normalizeCode('hello'), '');
});

test('archiving a semester and the cumulative average', () => {
  const courses = [
    { id: 'a', title: 'A', code: 'TEST 1001' },
    { id: 'b', title: 'B', code: 'DEMO 1002' },
    { id: 'c', title: 'C' },
  ];
  const grades = [
    { id: 'a', hours: '3', finalMark: '90' },
    { id: 'b', hours: '2', finalMark: '70' },
    { id: 'c', hours: '3' },
  ];
  const sem = semesterSummary('الفصل الأول 2030/2031', courses, grades, new Date(2031, 0, 30));
  assert.equal(sem.hours, 5);
  assert.equal(sem.average, 82);
  assert.equal(sem.courses.find(c => c.courseId === 'c').mark, null);
  const prev = combinedPrevious({ hours: 55, average: 80 }, [sem]);
  assert.equal(prev.hours, 60);
  assert.equal(prev.average, 80.17);
  assert.deepEqual(combinedPrevious({ hours: 55, average: '' }, []), { hours: 0, average: '' });
  assert.equal(passedHours({ hours: 55 }, [sem], 60), 60);
  assert.equal(suggestNextSemester('الفصل الأول 2030/2031'), 'الفصل الثاني 2030/2031');
  assert.equal(suggestNextSemester('الفصل الصيفي 2030/2031'), 'الفصل الأول 2031/2032');
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

test('2.0.0: no sample courses or personal plan ship with the app', async () => {
  const { readFile } = await import('node:fs/promises');
  for (const file of ['js/store.js', 'js/lib/semester.js', 'js/features/grades.js', 'js/app.js']) {
    const src = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(!/initialCourses|UCAS_FALL_2026|seedPlan/.test(src), `${file} still seeds`);
    // No course-code literal at all (the real plan lives only in a student's own backup).
    assert.ok(!/['"`][A-Z]{4} \d{4}['"`]/.test(src), `${file}: course-code literal`);
  }
});

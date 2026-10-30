// What releases up to 1.7.0 wrote into a new profile on first run: seven sample courses
// (course-1 … course-7, then `settings/seeded`) and, from the grades feature, a plan (codes, credit
// hours, passed hours, semester name, the `seed-ucas-fall-2026` flag). All rows were defaults with
// `_mtime` 0. Since 2.0.0 a new install starts empty, so browser tests that need courses create
// these rows themselves, exactly as an old release left them. Every value below is INVENTED test
// data; nothing here describes a real student or semester.
import { DEFAULT_COMPONENTS, DEFAULT_PASS_MARK } from '../../js/lib/grades.js';

export const LEGACY_TITLES = [
  'مبادئ الإحصاء الوصفي',
  'أساسيات الفيزياء العامة',
  'مهارات الاتصال والعرض',
  'مدخل إلى علم النفس',
  'تاريخ العلوم',
  'التفكير الناقد',
  'مقدمة في الخوارزميات',
];

/** An invented plan shaped like the one 1.7.0 shipped: 7 courses, 17 credit hours, 42 passed before it. */
export const LEGACY_PLAN = {
  key: 'ucas-fall-2026',
  name: 'الفصل الأول 2030/2031',
  previousHours: 42,
  courses: [
    { code: 'TEST 1101', title: 'أساسيات الفيزياء العامة', hours: 3 },
    { code: 'TEST 1102', title: 'مقدمة في الخوارزميات', hours: 3 },
    { code: 'TEST 2201', title: 'مهارات الاتصال والعرض', hours: 3 },
    { code: 'TEST 2202', title: 'مدخل إلى علم النفس', hours: 2 },
    { code: 'TEST 3301', title: 'مبادئ الإحصاء الوصفي', hours: 2 },
    { code: 'DEMO 1001', title: 'التفكير الناقد', hours: 2 },
    { code: 'DEMO 1002', title: 'تاريخ العلوم', hours: 2 },
  ],
};

/**
 * Write the legacy rows into the open page's IndexedDB (through js/store.js), then reload so the
 * app reads them. `plan: true` adds what the 1.7.0 grades feature wrote on top of the courses.
 */
export async function seedLegacy(page, { plan = false, reload = true } = {}) {
  await page.evaluate(
    async ({ titles, plan, components, passMark }) => {
      const s = await import('./js/store.js');
      const at = { mtime: 0 };
      for (let i = 0; i < titles.length; i++) {
        const p = plan?.courses.find(c => c.title === titles[i]);
        await s.put(
          'courses',
          {
            id: `course-${i + 1}`,
            title: titles[i],
            code: p ? p.code : '',
            createdAt: new Date().toISOString(),
          },
          at,
        );
        if (p)
          await s.put(
            'grades',
            {
              id: `course-${i + 1}`,
              courseId: `course-${i + 1}`,
              hours: String(p.hours),
              finalMark: '',
              target: '',
              components: components.map(c => ({ ...c, score: '', max: c.weight })),
            },
            at,
          );
      }
      await s.put('settings', { id: 'seeded', value: true }, at);
      if (!plan) return;
      await s.put(
        'settings',
        {
          id: 'gpa-settings',
          value: { passMark, previousHours: String(plan.previousHours), previousAverage: '' },
        },
        at,
      );
      await s.put('settings', { id: 'current-semester', value: plan.name }, at);
      await s.put('settings', { id: `seed-${plan.key}`, value: true }, at);
    },
    {
      titles: LEGACY_TITLES,
      plan: plan ? LEGACY_PLAN : null,
      components: DEFAULT_COMPONENTS,
      passMark: DEFAULT_PASS_MARK,
    },
  );
  if (reload) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.topbar');
  }
}

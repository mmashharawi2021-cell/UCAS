// UCAS Moodle Companion bridge. Only imports the student's visible course metadata.
import { all, put, makeId } from './store.js?v=1.7.0';
import { safeMoodleActivityURL } from './moodle.js?v=1.7.0';

// Long Moodle operations get room for slow connections; quick ones double as a presence check.
const TIMEOUTS = { SCAN: 190000, FILE_SCAN: 600000, FILE_OPEN: 480000, FILE_CHUNK: 30000 };
const TIMEOUT_ERRORS = {
  SCAN: 'تعذر إكمال فحص Moodle، تأكد من اتصال الإنترنت وجلسة الجامعة.',
  FILE_SCAN: 'انتهت مهلة فحص ملفات Moodle. تحقق من الاتصال وجلسة الجامعة ثم أعد المحاولة.',
  FILE_OPEN: 'انتهت مهلة تنزيل الملف من Moodle؛ قد يكون الاتصال بطيئًا أو الملف كبيرًا.',
  FILE_CHUNK: 'توقف نقل أجزاء الملف من الإضافة؛ أعد المحاولة.',
};
const NOT_DETECTED =
  'لم تُكتشف إضافة UCAS Moodle Companion. ثبّتها على Chrome للكمبيوتر ثم حدّث الصفحة.';

export function companionRequest(type, options = false) {
  if (
    ![
      'SCAN',
      'LAST',
      'AUTO',
      'FILE_SCAN',
      'FILE_LIST',
      'FILE_OPEN',
      'FILE_CHUNK',
      'FILE_CLOSE',
    ].includes(type)
  )
    return Promise.reject(Error('عملية غير مدعومة'));
  const args = options && typeof options === 'object' ? options : { enabled: options };
  const timeoutMs = TIMEOUTS[type] || 10000;
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const finish = (error, value) => {
      clearTimeout(timeout);
      window.removeEventListener('message', receive);
      if (error) reject(error);
      else resolve(value);
    };
    const receive = event => {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        event.data?.source !== 'UCAS_COMPANION_EXTENSION' ||
        event.data.requestId !== requestId
      )
        return;
      const result = event.data.result;
      if (!result?.ok)
        finish(
          Object.assign(Error(result?.error || 'تعذر الاتصال بإضافة Chrome'), {
            code: result?.code === 'login' ? 'login' : undefined,
          }),
        );
      else finish(null, result);
    };
    const timeout = setTimeout(
      () => finish(Error(TIMEOUT_ERRORS[type] || NOT_DETECTED)),
      timeoutMs,
    );
    window.addEventListener('message', receive);
    window.postMessage(
      {
        source: 'UCAS_COMPANION_WEB',
        requestId,
        type,
        enabled: args.enabled === true,
        fileId: args.fileId,
        sessionId: args.sessionId,
        offset: args.offset,
      },
      location.origin,
    );
  });
}

const clean = value =>
  String(value || '')
    .normalize('NFKC')
    .replace(/[إأآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[\u064b-\u065f\u0670\u0640]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('ar');
function validCourseURL(value, id) {
  try {
    const url = new URL(value);
    return (
      url.origin === 'https://moodle.ucas.edu.ps' &&
      url.pathname === '/course/view.php' &&
      url.searchParams.get('id') === id
    );
  } catch {
    return false;
  }
}
export async function importCompanionSnapshot(snapshot) {
  if (
    !snapshot ||
    snapshot.version !== 1 ||
    !Array.isArray(snapshot.courses) ||
    snapshot.courses.length > 150
  )
    throw Error('البيانات المستلمة من الإضافة غير صالحة');
  const courses = await all('courses');
  const resources = await all('resources');
  const tasks = await all('tasks');
  const stats = { courses: 0, linked: 0, resources: 0, tasks: 0, scanned: 0, failures: 0 };
  const seenCourses = new Set();
  for (const remote of snapshot.courses) {
    const moodleId = String(remote?.id || '');
    const title = String(remote?.title || '')
      .trim()
      .slice(0, 160);
    if (
      !/^\d{1,12}$/.test(moodleId) ||
      !title ||
      !validCourseURL(remote?.url, moodleId) ||
      seenCourses.has(moodleId)
    )
      continue;
    seenCourses.add(moodleId);
    stats.scanned++;
    const baseTitle = title.split(/\s+[-–]\s+/)[0].trim();
    const code = String(remote?.code || '')
      .trim()
      .slice(0, 60);
    let course = courses.find(c => c.moodleId === moodleId);
    if (!course) {
      course = courses.find(c => !c.moodleId && clean(c.title) === clean(baseTitle));
      if (course) {
        course = { ...course, moodleId };
        await put('courses', course);
        stats.linked++;
      }
    }
    if (!course) {
      course = {
        id: makeId(),
        title: baseTitle,
        code,
        moodleId,
        origin: 'moodle-companion',
        createdAt: new Date().toISOString(),
      };
      await put('courses', course);
      courses.push(course);
      stats.courses++;
    }
    if (!Array.isArray(remote.activities)) continue;
    for (const activity of remote.activities.slice(0, 220)) {
      const url = safeMoodleActivityURL(activity?.url);
      const name = String(activity?.title || '')
        .trim()
        .slice(0, 180);
      if (!url || !name) continue;
      const module =
        String(activity?.section || '')
          .trim()
          .slice(0, 120) || 'مصادر Moodle';
      if (!resources.some(r => r.courseId === course.id && r.url === url)) {
        const resource = {
          id: makeId(),
          kind: 'link',
          origin: 'moodle-companion',
          name,
          courseId: course.id,
          module,
          url,
          addedAt: new Date().toISOString(),
          completed: false,
        };
        await put('resources', resource);
        resources.push(resource);
        stats.resources++;
      }
      if (
        activity.type === 'assign' &&
        !tasks.some(
          t =>
            t.courseId === course.id &&
            (t.moodleActivityURL === url || clean(t.title) === clean(name)),
        )
      ) {
        const task = {
          id: makeId(),
          title: name,
          courseId: course.id,
          due: '',
          done: false,
          moodleActivityURL: url,
          origin: 'moodle-companion',
          createdAt: new Date().toISOString(),
        };
        await put('tasks', task);
        tasks.push(task);
        stats.tasks++;
      }
    }
  }
  stats.failures = Array.isArray(snapshot.failures) ? snapshot.failures.length : 0;
  return stats;
}

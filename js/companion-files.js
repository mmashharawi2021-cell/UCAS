// Read-only, explicit Moodle file transfers into UCAS IndexedDB.
// Extension fetches are done in the logged-in Moodle tab, never by this page.
import { all, getFile, put, makeId, storageStatus, requestPersistence } from './store.js?v=2.0.0';
import { companionRequest } from './companion.js?v=2.0.0';
import { safeMoodleActivityURL } from './moodle.js?v=2.0.0';

// Larger files, or files the browser has no room for, are saved as a link to their Moodle page.
export const MAX_COMPANION_FILE_BYTES = 200 * 1024 * 1024;
const MAX_CHUNK_BYTES = 512 * 1024;
const EXT = /\.(?:pdf|docx?|pptx?|xlsx?|txt|md|csv|zip|png|jpe?g|webp)$/i;
const UUID = /^[a-f0-9-]{36}$/;
const SHA = /^[a-f0-9]{64}$/;
// Stored files are previewed and opened on this origin, so their type comes from the file
// extension, never from the extension's message or Moodle's response header.
const TYPES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  zip: 'application/zip',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
export const typeForName = name =>
  TYPES[/\.([a-z0-9]+)$/i.exec(String(name))?.[1].toLowerCase()] || 'application/octet-stream';

export function validateFileCatalog(files) {
  if (!Array.isArray(files) || files.length > 1200) throw Error('عدد ملفات غير صالح');
  const used = new Set();
  return files
    .filter(f => {
      if (
        !f ||
        !UUID.test(f.id || '') ||
        used.has(f.id) ||
        !/^\d{1,12}$/.test(String(f.courseId || '')) ||
        !SHA.test(f.sourceKey || '') ||
        !String(f.name || '').trim() ||
        String(f.name).length > 180 ||
        String(f.module || '').length > 120
      )
        return false;
      used.add(f.id);
      return true;
    })
    .map(f => ({
      id: f.id,
      courseId: String(f.courseId),
      sourceKey: f.sourceKey,
      name: f.name,
      module: f.module || 'مصادر Moodle',
      courseTitle: String(f.courseTitle || '').slice(0, 150),
    }));
}

function fromBase64(raw) {
  if (typeof raw !== 'string' || raw.length > 700000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw))
    throw Error('جزء ملف غير صالح');
  const bytes = atob(raw);
  return Uint8Array.from(bytes, char => char.charCodeAt(0));
}

export async function downloadCompanionFile(file, onProgress = () => {}, cancelled = () => false) {
  if (!file || !UUID.test(file.id || '')) throw Error('معرف الملف غير صالح');
  let opened;
  try {
    if (cancelled()) throw Error('تم إيقاف نقل الملفات');
    opened = await companionRequest('FILE_OPEN', { fileId: file.id });
    if (
      opened.size < 1 ||
      !Number.isSafeInteger(opened.size) ||
      opened.sourceKey !== file.sourceKey ||
      opened.courseId !== file.courseId
    )
      throw Error('بيانات الملف مختلفة عن القائمة، أعد فحص المساق');
    const name = String(opened.name || file.name).trim();
    if (!EXT.test(name)) throw Error('صيغة الملف غير مدعومة');
    if (opened.size > MAX_COMPANION_FILE_BYTES)
      throw Object.assign(Error('حجم الملف أكبر من 200 MB'), {
        code: 'too_large',
        link: opened.home,
      });
    const used = await storageStatus();
    if (used.quota && used.usage != null && used.usage + opened.size > used.quota * 0.95)
      throw Object.assign(Error('المساحة المتاحة في المتصفح غير كافية'), {
        code: 'no_space',
        link: opened.home,
      });
    const chunks = [];
    let offset = 0;
    while (offset < opened.size) {
      if (cancelled()) throw Error('تم إيقاف نقل الملفات');
      const packet = await companionRequest('FILE_CHUNK', {
        fileId: file.id,
        sessionId: opened.sessionId,
        offset,
      });
      const chunk = fromBase64(packet.base64);
      if (
        packet.offset !== offset ||
        !chunk.byteLength ||
        chunk.byteLength !== packet.count ||
        chunk.byteLength > MAX_CHUNK_BYTES ||
        offset + chunk.byteLength > opened.size
      )
        throw Error('بيانات جزء الملف غير متطابقة');
      chunks.push(chunk);
      offset += chunk.byteLength;
      onProgress(offset, opened.size);
    }
    const mime = typeForName(name);
    return { blob: new Blob(chunks, { type: mime }), size: opened.size, name, mime };
  } finally {
    if (opened?.sessionId)
      await companionRequest('FILE_CLOSE', {
        fileId: file.id,
        sessionId: opened.sessionId,
      }).catch(() => {});
  }
}

// Save (once) a link to the Moodle page of a file that is not copied into the browser.
async function saveLink(file, course, link, resources) {
  const url = safeMoodleActivityURL(link);
  if (!url) return false;
  const known = resources.some(
    r =>
      r.courseId === course.id &&
      r.origin === 'moodle-companion-link' &&
      r.sourceKey === file.sourceKey,
  );
  if (!known) {
    const row = {
      id: makeId(),
      kind: 'link',
      origin: 'moodle-companion-link',
      sourceKey: file.sourceKey,
      name: file.name,
      courseId: course.id,
      module: file.module,
      url,
      addedAt: new Date().toISOString(),
      completed: false,
    };
    await put('resources', row);
    resources.push(row);
  }
  return true;
}

export async function transferCompanionFiles(files, onProgress, cancelled = () => false) {
  const list = validateFileCatalog(files);
  if (!list.length) throw Error('اختر الملفات التي تريد استيرادها');
  await requestPersistence();
  const courses = await all('courses');
  const resources = await all('resources');
  const summary = {
    total: list.length,
    added: 0,
    updated: 0,
    unchanged: 0,
    failed: 0,
    stopped: false,
    sessionExpired: false,
    linked: 0,
    errors: [],
    // One entry per selected file: added, updated, unchanged, linked, failed or skipped.
    results: [],
  };
  const record = (file, status, reason = '') =>
    summary.results.push({ id: file.id, name: file.name, status, reason });
  const skipRest = (from, reason) => {
    for (const rest of list.slice(from)) record(rest, 'skipped', reason);
  };
  for (let i = 0; i < list.length; i++) {
    if (cancelled()) {
      summary.stopped = true;
      skipRest(i, 'أُوقف النقل قبل هذا الملف');
      break;
    }
    const file = list[i];
    const course = courses.find(c => String(c.moodleId || '') === file.courseId);
    if (!course) {
      const reason = 'المساق غير مربوط؛ قم بمزامنة المساقات أولًا';
      summary.failed++;
      summary.errors.push(file.name + ': ' + reason);
      record(file, 'failed', reason);
      continue;
    }
    let lastPercent = -1;
    try {
      onProgress({ index: i + 1, total: list.length, name: file.name, percent: 0 });
      const received = await downloadCompanionFile(
        file,
        (bytes, size) => {
          const percent = Math.round((bytes / size) * 100);
          if (percent !== lastPercent && (percent === 100 || percent - lastPercent >= 5)) {
            lastPercent = percent;
            onProgress({ index: i + 1, total: list.length, name: file.name, percent });
          }
        },
        cancelled,
      );
      const buf = await received.blob.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      const hash = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
      let existing = resources.find(
        r =>
          r.courseId === course.id &&
          r.origin === 'moodle-companion-file' &&
          r.sourceKey === file.sourceKey,
      );
      if (existing?.hash === hash && (await getFile(existing.id))) {
        summary.unchanged++;
        record(file, 'unchanged');
        continue;
      }
      // Preserve course progress and user edits on subsequent content updates.
      const row = {
        ...(existing || {}),
        id: existing?.id || makeId(),
        courseId: course.id,
        origin: 'moodle-companion-file',
        sourceKey: file.sourceKey,
        name: existing?.name || received.name,
        kind: 'file',
        module: existing?.module || file.module,
        type: received.mime,
        size: received.size,
        hash,
        blob: received.blob,
        addedAt: existing?.addedAt || new Date().toISOString(),
        completed: existing?.completed || false,
      };
      await put('resources', row);
      if (existing) {
        summary.updated++;
        record(file, 'updated');
      } else {
        resources.push({ ...row, blob: undefined });
        summary.added++;
        record(file, 'added');
      }
    } catch (err) {
      if (cancelled()) {
        summary.stopped = true;
        skipRest(i, 'أُوقف النقل قبل اكتمال هذا الملف');
        break;
      }
      if (
        (err?.code === 'too_large' || err?.code === 'no_space') &&
        (await saveLink(file, course, err.link, resources))
      ) {
        summary.linked++;
        record(
          file,
          'linked',
          err.code === 'too_large'
            ? 'أكبر من 200 MB؛ حُفظ رابطه في Moodle بدل الملف'
            : 'مساحة المتصفح لا تكفي؛ حُفظ رابطه في Moodle بدل الملف',
        );
        continue;
      }
      const reason = err?.message || 'تعذر التحميل';
      summary.failed++;
      if (summary.errors.length < 30) summary.errors.push(file.name + ': ' + reason);
      record(file, 'failed', reason);
      if (err?.code === 'login') {
        // Every remaining file would fail the same way; let the student sign in and retry.
        summary.sessionExpired = true;
        skipRest(i + 1, 'لم يُنقل بعد لأن جلسة Moodle انتهت');
        break;
      }
    }
  }
  return summary;
}

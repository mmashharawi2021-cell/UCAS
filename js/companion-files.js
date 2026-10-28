// Read-only, explicit Moodle file transfers into UCAS IndexedDB.
// Extension fetches are done in the logged-in Moodle tab, never by this page.
import { all, getFile, put, makeId, storageStatus, requestPersistence } from './store.js?v=1.7.0';
import { companionRequest } from './companion.js?v=1.7.0';

export const MAX_COMPANION_FILE_BYTES = 35 * 1024 * 1024;
const EXT = /\.(?:pdf|docx?|pptx?|xlsx?|txt|md|csv|zip|png|jpe?g|webp)$/i;
const UUID = /^[a-f0-9-]{36}$/;
const SHA = /^[a-f0-9]{64}$/;

export function validateFileCatalog(files) {
  if (!Array.isArray(files) || files.length > 1200) throw Error('عدد ملفات غير صالح');
  const used = new Set();
  return files.filter(f => {
    if (!f || !UUID.test(f.id || '') || used.has(f.id) ||
        !/^\d{1,12}$/.test(String(f.courseId || '')) ||
        !SHA.test(f.sourceKey || '') ||
        !String(f.name || '').trim() || String(f.name).length > 180 ||
        String(f.module || '').length > 120) return false;
    used.add(f.id);
    return true;
  }).map(f => ({
    id: f.id, courseId: String(f.courseId), sourceKey: f.sourceKey,
    name: f.name, module: f.module || 'مصادر Moodle',
    courseTitle: String(f.courseTitle || '').slice(0, 150),
  }));
}

function fromBase64(raw) {
  if (typeof raw !== 'string' || raw.length > 140000 || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw))
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
    if (opened.size < 1 || opened.size > MAX_COMPANION_FILE_BYTES ||
        !Number.isSafeInteger(opened.size) ||
        opened.sourceKey !== file.sourceKey || opened.courseId !== file.courseId)
      throw Error('بيانات الملف مختلفة عن القائمة، أعد فحص المساق');
    const name = String(opened.name || file.name).trim();
    if (!EXT.test(name)) throw Error('صيغة الملف غير مدعومة');
    const chunks = [];
    let offset = 0;
    while (offset < opened.size) {
      if (cancelled()) throw Error('تم إيقاف نقل الملفات');
      const packet = await companionRequest('FILE_CHUNK', {
        fileId: file.id, sessionId: opened.sessionId, offset,
      });
      const chunk = fromBase64(packet.base64);
      if (packet.offset !== offset || !chunk.byteLength ||
          chunk.byteLength !== packet.count ||
          chunk.byteLength > 96 * 1024 || offset + chunk.byteLength > opened.size)
        throw Error('بيانات جزء الملف غير متطابقة');
      chunks.push(chunk);
      offset += chunk.byteLength;
      onProgress(offset, opened.size);
    }
    return { blob: new Blob(chunks, { type: opened.mime || 'application/octet-stream' }),
      size: opened.size, name, mime: opened.mime || 'application/octet-stream' };
  } finally {
    if (opened?.sessionId)
      await companionRequest('FILE_CLOSE', {
        fileId: file.id, sessionId: opened.sessionId,
      }).catch(() => {});
  }
}

export async function transferCompanionFiles(files, onProgress, cancelled = () => false) {
  const list = validateFileCatalog(files);
  if (!list.length) throw Error('اختر الملفات التي تريد استيرادها');
  await requestPersistence();
  const courses = await all('courses');
  const resources = await all('resources');
  const summary = { total: list.length, added: 0, updated: 0, unchanged: 0, failed: 0, stopped: false, errors: [] };
  for (let i = 0; i < list.length; i++) {
    if (cancelled()) { summary.stopped = true; break; }
    const file = list[i];
    const course = courses.find(c => String(c.moodleId || '') === file.courseId);
    if (!course) {
      summary.failed++;
      summary.errors.push(file.name + ': المساق غير مربوط؛ قم بمزامنة المساقات أولًا');
      continue;
    }
    let lastPercent = -1;
    try {
      onProgress({ index: i + 1, total: list.length, name: file.name, percent: 0 });
      const received = await downloadCompanionFile(file, (bytes, size) => {
        const percent = Math.round(bytes / size * 100);
        if (percent !== lastPercent && (percent === 100 || percent - lastPercent >= 5)) {
          lastPercent = percent;
          onProgress({ index: i + 1, total: list.length, name: file.name, percent });
        }
      }, cancelled);
      const used = await storageStatus();
      if (used.quota && used.usage != null &&
          used.usage + received.size > used.quota * 0.95)
        throw Error('المساحة المتاحة في المتصفح غير كافية؛ احتفظ بنسخة احتياطية أولًا');
      const buf = await received.blob.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buf);
      const hash = [...new Uint8Array(digest)]
        .map(v => v.toString(16).padStart(2, '0')).join('');
      let existing = resources.find(r => r.courseId === course.id &&
        r.origin === 'moodle-companion-file' && r.sourceKey === file.sourceKey);
      if (existing?.hash === hash && await getFile(existing.id)) {
        summary.unchanged++;
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
      if (existing) summary.updated++;
      else { resources.push({ ...row, blob: undefined }); summary.added++; }
    } catch (err) {
      if (cancelled()) { summary.stopped = true; break; }
      summary.failed++;
      if (summary.errors.length < 30)
        summary.errors.push(file.name + ': ' + (err?.message || 'تعذر التحميل'));
    }
  }
  return summary;
}

// UCAS Academic Bridge: study files and safe Drive references. No OAuth secrets.
export const MAX_STUDY_FILE_BYTES = 35 * 1024 * 1024;
export const MAX_STUDY_BATCH = 30;
export const STUDY_FILE_PATTERN = /\.(pdf|docx|pptx|txt|md)$/i;
const ID = /^[a-zA-Z0-9_-]{10,200}$/;
const validName = s =>
  String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 180);

export function validateStudyFiles(files) {
  const list = Array.from(files || []);
  if (!list.length) throw new Error('اختر ملفًا واحدًا على الأقل من جهازك أو Google Drive');
  if (list.length > MAX_STUDY_BATCH) throw new Error('اختر حتى 30 ملفًا في كل عملية استيراد');
  const allowed = [],
    rejected = [];
  for (const f of list) {
    if (!STUDY_FILE_PATTERN.test(f.name || '')) {
      rejected.push({ name: f.name, reason: 'صيغة غير مدعومة' });
      continue;
    }
    if (f.size > MAX_STUDY_FILE_BYTES) {
      rejected.push({ name: f.name, reason: 'يتجاوز 35 MB' });
      continue;
    }
    if (f.size === 0) {
      rejected.push({ name: f.name, reason: 'ملف فارغ' });
      continue;
    }
    allowed.push(f);
  }
  return { allowed, rejected };
}

export function parseDriveReference(raw) {
  if (typeof raw !== 'string' || raw.length > 2000) return null;
  let u;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  let id, type, url;
  if (u.hostname === 'drive.google.com') {
    let m = /^\/file\/d\/([^/]+)(?:\/(?:view|preview|edit))?\/?$/.exec(u.pathname);
    if (m) {
      id = m[1];
      type = 'file';
      url = 'https://drive.google.com/file/d/' + id + '/view';
    } else if (u.pathname === '/open') {
      id = u.searchParams.get('id');
      type = 'file';
      url = 'https://drive.google.com/file/d/' + id + '/view';
    } else if ((m = /^\/drive\/folders\/([^/]+)\/?$/.exec(u.pathname))) {
      id = m[1];
      type = 'folder';
      url = 'https://drive.google.com/drive/folders/' + id;
    }
  } else if (u.hostname === 'docs.google.com') {
    let m = /^\/(document|presentation|spreadsheets)\/d\/([^/]+)(?:\/.*)?$/.exec(u.pathname);
    if (m) {
      type = m[1];
      id = m[2];
      url = 'https://docs.google.com/' + type + '/d/' + id + '/edit';
    }
  }
  if (!id || !ID.test(id)) return null;
  return { id, type, url };
}
export function normalizeDriveTitle(title, ref) {
  return (
    validName(title) ||
    {
      file: 'ملف Google Drive',
      folder: 'مجلد Google Drive',
      document: 'مستند Google Docs',
      presentation: 'عرض Google Slides',
      spreadsheets: 'جدول Google Sheets',
    }[ref.type] ||
    'مصدر Google Drive'
  );
}

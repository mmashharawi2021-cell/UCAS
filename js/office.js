// Small, dependency-free text previewer for standard DOCX/PPTX (ZIP/XML) files.
// It extracts selected XML parts only. Never injects file text as HTML.
const MAX_ARCHIVE_BYTES = 35 * 1024 * 1024;
const MAX_PART_BYTES = 5 * 1024 * 1024;
const MAX_PREVIEW_CHARS = 120_000;
const decoder = new TextDecoder('utf-8', { fatal: false });

function checkRange(view, pos, count) {
  if (pos < 0 || count < 0 || pos + count > view.byteLength)
    throw new Error('بنية ملف Office غير سليمة');
}
function u16(view, pos) {
  checkRange(view, pos, 2);
  return view.getUint16(pos, true);
}
function u32(view, pos) {
  checkRange(view, pos, 4);
  return view.getUint32(pos, true);
}
function readZipEntries(buffer) {
  const view = new DataView(buffer);
  // End of Central Directory may have up to 65535 bytes of ZIP comment.
  let end = -1;
  for (let p = view.byteLength - 22; p >= Math.max(0, view.byteLength - 65557); p--) {
    if (u32(view, p) === 0x06054b50 && p + 22 + u16(view, p + 20) === view.byteLength) {
      end = p;
      break;
    }
  }
  if (end < 0) throw new Error('ملف Office ليس أرشيف ZIP صالحًا أو يستخدم ZIP64');
  const count = u16(view, end + 10),
    centralOffset = u32(view, end + 16);
  if (count > 3000) throw new Error('عدد مكونات الملف أكبر من الحد المدعوم');
  let cursor = centralOffset;
  const entries = [];
  for (let i = 0; i < count; i++) {
    if (u32(view, cursor) !== 0x02014b50) throw new Error('فهرس أرشيف Office غير صالح');
    const flags = u16(view, cursor + 8),
      method = u16(view, cursor + 10);
    const packed = u32(view, cursor + 20),
      size = u32(view, cursor + 24);
    const nameLen = u16(view, cursor + 28),
      extra = u16(view, cursor + 30),
      comment = u16(view, cursor + 32);
    const start = cursor + 46;
    checkRange(view, start, nameLen + extra + comment);
    const name = decoder.decode(new Uint8Array(buffer, start, nameLen));
    entries.push({ name, flags, method, packed, size, offset: u32(view, cursor + 42) });
    cursor = start + nameLen + extra + comment;
  }
  return { view, entries };
}
async function extractPart(archive, entry) {
  const { view } = archive;
  if (entry.flags & 1) throw new Error('المستند مشفر ولا يمكن معاينته');
  if (entry.size > MAX_PART_BYTES || entry.packed > MAX_PART_BYTES)
    throw new Error('مكوّن الملف أكبر من الحد المسموح للمعاينة');
  const offset = entry.offset;
  if (u32(view, offset) !== 0x04034b50) throw new Error('بيانات مكوّن الملف غير سليمة');
  const dataStart = offset + 30 + u16(view, offset + 26) + u16(view, offset + 28);
  checkRange(view, dataStart, entry.packed);
  const bytes = new Uint8Array(view.buffer, dataStart, entry.packed);
  if (entry.method === 0) return decoder.decode(bytes);
  if (entry.method !== 8) throw new Error('طريقة ضغط Office غير مدعومة');
  if (typeof DecompressionStream !== 'function')
    throw new Error('المتصفح لا يدعم معاينة ملفات Office المضغوطة');
  let stream;
  try {
    stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  } catch {
    throw new Error('المتصفح لا يدعم فك ضغط Office؛ يمكن تنزيل الملف وفتحه خارجيًا');
  }
  const reader = stream.getReader(),
    chunks = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PART_BYTES) {
        await reader.cancel();
        throw new Error('المستند أكبر من حد المعاينة الآمن');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total !== entry.size) throw new Error('حجم ملف Office غير متوقع');
  const result = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    result.set(chunk, cursor);
    cursor += chunk.byteLength;
  }
  return decoder.decode(result);
}
function paragraphs(xml) {
  if (typeof DOMParser === 'undefined') throw new Error('معاينة النص تتطلب متصفحًا يدعم XML');
  const document = new DOMParser().parseFromString(xml, 'application/xml');
  if (document.querySelector('parsererror')) throw new Error('محتوى المستند XML غير صالح');
  return [...document.getElementsByTagName('*')]
    .filter(el => el.localName === 'p')
    .map(p =>
      [...p.getElementsByTagName('*')]
        .filter(el => el.localName === 't')
        .map(el => el.textContent)
        .join('')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}
export async function previewOffice(file) {
  if (!file || file.size > MAX_ARCHIVE_BYTES)
    throw new Error('هذا المستند أكبر من الحد المسموح لمعاينة Office (35 MB)');
  const name = (file.name || '').toLowerCase();
  const isDoc = name.endsWith('.docx'),
    isPpt = name.endsWith('.pptx');
  if (!isDoc && !isPpt) throw new Error('صيغة غير مدعومة للمعاينة');
  const archive = readZipEntries(await file.arrayBuffer());
  const entries = isDoc
    ? archive.entries.filter(e => e.name === 'word/document.xml')
    : archive.entries
        .filter(e => /^ppt\/slides\/slide\d+\.xml$/.test(e.name))
        .sort(
          (a, b) => Number(a.name.match(/slide(\d+)/)[1]) - Number(b.name.match(/slide(\d+)/)[1]),
        );
  if (!entries.length) throw new Error('لم يُعثر على محتوى المحاضرة داخل الملف');
  const parts = [];
  let chars = 0;
  for (const entry of entries) {
    const text = paragraphs(await extractPart(archive, entry));
    if (!text) continue;
    const heading = isPpt ? `شريحة ${entry.name.match(/slide(\d+)/)[1]}\n` : '';
    const snippet = (heading + text).slice(0, MAX_PREVIEW_CHARS - chars);
    parts.push(snippet);
    chars += snippet.length;
    if (chars >= MAX_PREVIEW_CHARS) break;
  }
  return { text: parts.join('\n\n'), truncated: chars >= MAX_PREVIEW_CHARS };
}

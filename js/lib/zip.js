// Minimal ZIP ("stored", no compression) over Blobs, used for full backups.
// Entries are referenced as Blob parts and read back as Blob slices, so a backup
// never has to fit in a single JS string or ArrayBuffer. No ZIP64: < 4 GiB, < 65535 entries.
const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;
const UTF8_NAMES = 0x0800;
const MAX = 0xffffffff;

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 of a Blob, streamed chunk by chunk. */
export async function crc32(blob) {
  let c = 0xffffffff;
  const reader = blob.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    for (let i = 0; i < value.length; i++) c = TABLE[(c ^ value[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(d) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date =
    ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

/** Build a ZIP Blob from `[{ name, blob }]` without copying the entries into memory. */
export async function zipBlobs(entries, now = new Date()) {
  if (entries.length > 0xffff) throw new Error('عدد الملفات أكبر من الحد المسموح في النسخة');
  const { time, date } = dosDateTime(now);
  const enc = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, blob } of entries) {
    const bytes = enc.encode(name);
    const crc = await crc32(blob);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, LOCAL, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, UTF8_NAMES, true);
    local.setUint16(10, time, true);
    local.setUint16(12, date, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, blob.size, true);
    local.setUint32(22, blob.size, true);
    local.setUint16(26, bytes.length, true);
    parts.push(local, bytes, blob);
    const record = new DataView(new ArrayBuffer(46));
    record.setUint32(0, CENTRAL, true);
    record.setUint16(4, 20, true);
    record.setUint16(6, 20, true);
    record.setUint16(8, UTF8_NAMES, true);
    record.setUint16(12, time, true);
    record.setUint16(14, date, true);
    record.setUint32(16, crc, true);
    record.setUint32(20, blob.size, true);
    record.setUint32(24, blob.size, true);
    record.setUint16(28, bytes.length, true);
    record.setUint32(42, offset, true);
    central.push(record, bytes);
    offset += 30 + bytes.length + blob.size;
    if (offset > MAX) throw new Error('حجم النسخة الاحتياطية يتجاوز 4 GB');
  }
  const centralSize = central.reduce((sum, p) => sum + p.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, END, true);
  end.setUint16(8, entries.length, true);
  end.setUint16(10, entries.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}

const invalid = () => new Error('أرشيف النسخة الاحتياطية غير صالح');

/** List the entries of a stored ZIP Blob as `[{ name, size, crc, blob }]` (lazy slices). */
export async function readZip(blob) {
  const tailStart = Math.max(0, blob.size - (22 + 0xffff));
  const tail = new DataView(await blob.slice(tailStart).arrayBuffer());
  let end = -1;
  for (let p = tail.byteLength - 22; p >= 0; p--)
    if (tail.getUint32(p, true) === END) {
      end = p;
      break;
    }
  if (end < 0) throw invalid();
  const count = tail.getUint16(end + 10, true);
  const size = tail.getUint32(end + 12, true);
  const start = tail.getUint32(end + 16, true);
  if (start + size > blob.size) throw invalid();
  const cd = new DataView(await blob.slice(start, start + size).arrayBuffer());
  const dec = new TextDecoder();
  const entries = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (p + 46 > cd.byteLength || cd.getUint32(p, true) !== CENTRAL) throw invalid();
    const flags = cd.getUint16(p + 8, true);
    const method = cd.getUint16(p + 10, true);
    const crc = cd.getUint32(p + 16, true);
    const packed = cd.getUint32(p + 20, true);
    const length = cd.getUint32(p + 24, true);
    const n = cd.getUint16(p + 28, true);
    const extra = cd.getUint16(p + 30, true) + cd.getUint16(p + 32, true);
    const local = cd.getUint32(p + 42, true);
    if (p + 46 + n > cd.byteLength) throw invalid();
    if (method !== 0 || flags & 1 || packed !== length)
      throw new Error('صيغة الأرشيف غير مدعومة؛ استخدم ملف النسخة كما نزّلته من UCAS');
    const name = dec.decode(new Uint8Array(cd.buffer, p + 46, n));
    const head = new DataView(await blob.slice(local, local + 30).arrayBuffer());
    if (head.byteLength < 30 || head.getUint32(0, true) !== LOCAL) throw invalid();
    const data = local + 30 + head.getUint16(26, true) + head.getUint16(28, true);
    if (data + length > blob.size) throw invalid();
    entries.push({ name, size: length, crc, blob: blob.slice(data, data + length) });
    p += 46 + n + extra;
  }
  return entries;
}

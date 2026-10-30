// Text-only PDF processing with pinned Mozilla PDF.js, on this device.
// The library is downloaded on first use; the PDF bytes are not uploaded.
// This is not OCR and cannot read text from scanned image-only pages.
import { pagesPhrase } from './lib/ai-limits.js?v=2.0.0';

const PDFJS_VERSION = '4.10.38';
const PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VERSION + '/';
const MAX_PDF_BYTES = 35 * 1024 * 1024;
// Measured by ucas-performance and approved by the owner: a 200-page lecture fits on a phone.
export const MAX_PAGES = 200;
export const MAX_TEXT_CHARS = 350000;
let libraryPromise;

export async function getPdfLibrary() {
  if (!libraryPromise) {
    libraryPromise = import(PDFJS_BASE + 'pdf.min.mjs')
      .then(lib => {
        lib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.mjs';
        return lib;
      })
      .catch(error => {
        libraryPromise = null;
        throw new Error(
          'تعذر تحميل أداة PDF.js. اتصل بالإنترنت وحاول مجددًا: ' + String(error?.message || error),
        );
      });
  }
  return libraryPromise;
}
function itemGap(previous, item) {
  if (!previous?.transform || !item?.transform) return null;
  const prevX = Number(previous.transform[4]),
    nextX = Number(item.transform[4]);
  const width = Number(previous.width);
  if (!Number.isFinite(prevX) || !Number.isFinite(nextX) || !Number.isFinite(width)) return null;
  const direction = String(previous.dir || item.dir || 'ltr').toLowerCase();
  const gap =
    direction === 'rtl' ? prevX - (nextX + Number(item.width || 0)) : nextX - (prevX + width);
  return Number.isFinite(gap) ? gap : null;
}
export function normalizePageItems(items) {
  const rows = [];
  let current = '',
    previous = null;
  for (const item of items || []) {
    const str = String(item?.str || '');
    if (str) {
      const gap = itemGap(previous, item);
      const prevStr = String(previous?.str || '');
      // PDF.js already includes many word spaces. Never unconditionally insert
      // spaces between glyphs: Arabic PDFs may expose one glyph per item.
      const betweenWords =
        gap === null
          ? /[A-Za-z0-9]$/.test(prevStr) && /^[A-Za-z0-9]/.test(str)
          : gap > Math.max(2, Math.abs(Number(item.height || previous?.height || 10)) * 0.2);
      if (current && !/\s$/.test(current) && !/^\s/.test(str) && betweenWords) current += ' ';
      current += str;
      previous = item;
    }
    if (item?.hasEOL) {
      if (current.trim()) rows.push(current.trim());
      current = '';
      previous = null;
    }
  }
  if (current.trim()) rows.push(current.trim());
  return rows
    .join('\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
export function pdfTextQuality(text) {
  const source = String(text || '');
  const arabicWords = source.match(/[\u0621-\u064A]+/g) || [];
  const singles = arabicWords.filter(w => w.length === 1).length;
  const arabicChars = arabicWords.reduce((n, w) => n + w.length, 0);
  const invalid = (source.match(/\uFFFD/g) || []).length;
  const brokenArabic =
    arabicChars >= 35 && arabicWords.length >= 20 && singles / arabicWords.length > 0.46;
  const corrupted = brokenArabic || (source.length > 40 && invalid / source.length > 0.035);
  return {
    corrupted,
    reason: brokenArabic ? 'حروف عربية متقطعة' : invalid ? 'رموز غير معروفة' : '',
    arabicChars,
    arabicSingletonRatio: arabicWords.length ? singles / arabicWords.length : 0,
  };
}
export async function extractPdfText(
  file,
  { maxPages = MAX_PAGES, maxChars = MAX_TEXT_CHARS, loader = getPdfLibrary } = {},
) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('ملف PDF غير صالح');
  if (file.size > MAX_PDF_BYTES) throw new Error('حجم PDF يتجاوز الحد 35 MB');
  if (file.size < 10) throw new Error('ملف PDF فارغ أو تالف');
  const lib = await loader();
  // Never pass a URL to PDF.js: only raw bytes from a user-selected file.
  const data = new Uint8Array(await file.arrayBuffer());
  const task = lib.getDocument({
    data,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: true,
  });
  let document;
  try {
    document = await task.promise;
    const totalPages = document.numPages;
    const pages = [];
    const limit = Math.min(totalPages, maxPages);
    let length = 0,
      cutPage = null;
    for (let n = 1; n <= limit; n++) {
      const page = await document.getPage(n);
      const content = await page.getTextContent();
      const text = normalizePageItems(content.items);
      page.cleanup();
      if (text.trim()) {
        // Pages are joined with a newline, so every page after the first costs one more character:
        // the joined text never exceeds maxChars and nothing downstream has to cut it again.
        const remaining = maxChars - length - (pages.length ? 1 : 0);
        if (remaining <= 0) {
          // The character budget ran out on an earlier page; this page has more text.
          cutPage = pages.length ? pages[pages.length - 1].page : n;
          break;
        }
        const clipped = text.slice(0, remaining);
        pages.push({ page: n, text: clipped });
        length += clipped.length + (pages.length > 1 ? 1 : 0);
        if (clipped.length < text.length) {
          cutPage = n;
          break;
        }
      }
    }
    if (!pages.length)
      throw new Error(
        'ملف PDF لا يحتوي على نص قابل للاستخراج. قد يكون عبارة عن صور ممسوحة ضوئيًا ويتطلب OCR.',
      );
    const quality = pdfTextQuality(pages.map(p => p.text).join('\n'));
    if (quality.corrupted)
      throw new Error(
        'النص المستخرج من PDF غير مقروء (' +
          quality.reason +
          '). جرّب ملف PDF الأصلي باللغة الإنجليزية أو نسخة نصية قابلة للنسخ، بدل إنشاء بطاقات غير دقيقة.',
      );
    return {
      text: pages.map(x => x.text).join('\n'),
      pages,
      totalPages,
      pagesExamined: limit,
      truncated: totalPages > limit || cutPage !== null,
      // 'chars': the text stopped inside page `cutPage`; 'pages': the page limit was reached.
      cutBy: cutPage !== null ? 'chars' : totalPages > limit ? 'pages' : '',
      cutPage,
    };
  } catch (error) {
    if (/لا يحتوي على نص/.test(String(error?.message))) throw error;
    throw new Error('تعذر استخراج نص PDF: ' + String(error?.message || error), { cause: error });
  } finally {
    if (document) await document.destroy();
    else await task.destroy();
  }
}

/** Student-facing note for a PDF that was not read to the end, or '' when it was read fully. */
export function pdfTruncationNote(info) {
  if (!info?.truncated) return '';
  const total = Number(info.totalPages) || 0;
  if (info.cutBy === 'chars' && info.cutPage)
    return 'اقتُطع النص عند الصفحة ' + info.cutPage + ' من ' + total;
  return 'قُرئت أول ' + pagesPhrase(info.pagesExamined) + ' من ' + total;
}

// Optional in-browser OCR for PDFs with unreadable embedded Arabic text.
// User action only. Never sends the PDF or its rendered canvas to a server.
// Tesseract assets/language packs are downloaded from pinned public CDNs.
import { getPdfLibrary, pdfTextQuality } from './pdf-text.js';

const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.esm.min.js';
const MAX_OCR_PAGES = 3,
  MAX_OCR_FILE = 35 * 1024 * 1024,
  MAX_OCR_PIXELS = 2500000;
let recognitionLoader;

export async function defaultOCRWorker() {
  if (!recognitionLoader)
    recognitionLoader = import(TESSERACT_URL).catch(error => {
      recognitionLoader = null;
      throw new Error('تعذر تحميل مكتبة OCR. تحقق من الإنترنت: ' + String(error?.message || error));
    });
  const { createWorker } = await recognitionLoader;
  return createWorker(['ara', 'eng'], 1);
}
export function ocrTextQuality(text) {
  const s = String(text || '').trim();
  const q = pdfTextQuality(s);
  return { usable: s.length >= 25 && !q.corrupted, reviewRequired: true };
}
export async function readPDFWithOCR(
  file,
  {
    maxPages = MAX_OCR_PAGES,
    pdfLoader = getPdfLibrary,
    ocrWorker = defaultOCRWorker,
    onProgress = () => {},
  } = {},
) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new Error('ملف PDF غير صالح');
  if (file.size < 10 || file.size > MAX_OCR_FILE)
    throw new Error('حجم الملف غير مناسب لاستخراج OCR (حتى 35 MB)');
  const safePages = Math.max(1, Math.min(MAX_OCR_PAGES, Math.trunc(maxPages) || MAX_OCR_PAGES));
  const pdfjs = await pdfLoader();
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: true,
  });
  let pdf = null,
    worker = null;
  try {
    pdf = await task.promise;
    const count = Math.min(pdf.numPages, safePages),
      pages = [];
    onProgress('تحميل حزمة OCR العربية والإنجليزية…');
    worker = await ocrWorker();
    for (let n = 1; n <= count; n++) {
      onProgress('التعرّف على النص في الصفحة ' + n + ' من ' + count + '…');
      const page = await pdf.getPage(n);
      const original = page.getViewport({ scale: 1.55 });
      const ratio = Math.min(1, Math.sqrt(MAX_OCR_PIXELS / (original.width * original.height)));
      const viewport = page.getViewport({ scale: 1.55 * ratio });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(viewport.width));
      canvas.height = Math.max(1, Math.ceil(viewport.height));
      const context = canvas.getContext('2d', { alpha: false });
      if (!context) throw new Error('المتصفح لا يدعم معالجة الصور على هذا الجهاز');
      try {
        await page.render({ canvasContext: context, viewport, canvas }).promise;
        const recognized = await worker.recognize(canvas);
        const text = String(recognized?.data?.text || '')
          .trim()
          .slice(0, 20000);
        if (ocrTextQuality(text).usable)
          pages.push({ page: n, text, ocr: true, needsReview: true });
      } finally {
        canvas.width = 0;
        canvas.height = 0;
        page.cleanup();
      }
    }
    if (!pages.length)
      throw new Error(
        'لم يتمكن OCR من استخراج نص واضح من الصفحات الثلاث الأولى. جرّب نسخة أخرى من الملف.',
      );
    return {
      pages,
      text: pages.map(x => x.text).join('\n'),
      totalPages: pdf.numPages,
      pagesExamined: count,
      needsReview: true,
      truncated: pdf.numPages > count,
    };
  } finally {
    try {
      if (worker) await worker.terminate();
    } catch {}
    if (pdf) await pdf.destroy();
    else await task.destroy();
  }
}

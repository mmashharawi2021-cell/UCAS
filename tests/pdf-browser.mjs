import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

function makePDF() {
  const text = 'UCAS GIS geospatial database indexing';
  const stream = 'BT /F1 16 Tf 72 710 Td (' + text + ') Tj ET\n';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + 'endstream',
  ];
  let content = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(content));
    content += i + 1 + ' 0 obj\n' + objects[i] + '\nendobj\n';
  }
  const xref = Buffer.byteLength(content);
  content += 'xref\n0 ' + (objects.length + 1) + '\n0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++)
    content += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  content +=
    'trailer\n<< /Size ' + (objects.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
  return Buffer.from(content, 'utf8').toString('base64');
}
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome',
  args: ['--no-sandbox'],
});
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8099/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.topbar');
  await page.evaluate(async pdfBase64 => {
    const { put } = await import('./js/store.js');
    const raw = atob(pdfBase64);
    const bytes = Uint8Array.from(raw, x => x.charCodeAt(0));
    const pdf = new Blob([bytes], { type: 'application/pdf' });
    await put('resources', {
      id: 'ci-pdf-lecture',
      kind: 'file',
      name: 'lecture-test.pdf',
      courseId: 'course-1',
      module: 'PDF اختبار',
      blob: pdf,
      size: pdf.size,
      addedAt: new Date().toISOString(),
      completed: false,
    });
  }, makePDF());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-course="course-1"]');
  await page.locator('[data-course="course-1"]').first().click();
  await page.waitForSelector('[data-action="assistant"]');
  await page.locator('[data-action="assistant"]').click();
  await page.waitForSelector('#study-query');
  await page.locator('#study-query').fill('geospatial');
  await page.locator('#study-search-form button[type="submit"]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('#study-results')?.textContent?.includes('lecture-test.pdf') ||
      document.querySelector('#study-results')?.textContent?.includes('تعذر'),
    null,
    { timeout: 30000 },
  );
  const text = await page.locator('#study-results').innerText();
  console.log(text.slice(0, 1200));
  assert.ok(
    text.includes('lecture-test.pdf') && text.includes('صفحة 1'),
    'PDF extraction failed: ' + text,
  );
  assert.equal(errors.length, 0, 'Unexpected page errors: ' + errors.join('\n'));
  // Broken Arabic PDF must offer explicit OCR recovery; it must not auto-run on search.
  await page.evaluate(async () => {
    const { put } = await import('./js/store.js');
    const broken = new Blob(['%PDF-1.4 broken Arabic content'], { type: 'application/pdf' });
    await put('resources', {
      id: 'ci-broken-arabic',
      kind: 'file',
      name: 'broken-summary.pdf',
      courseId: 'course-1',
      module: 'OCR candidate',
      blob: broken,
      size: broken.size,
      addedAt: new Date().toISOString(),
    });
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-course="course-1"]');
  await page.locator('[data-course="course-1"]').first().click();
  await page.locator('[data-action="assistant"]').click();
  await page.locator('[data-action="study-cards"]').click();
  await page.waitForSelector('[data-action="study-ocr"]', { timeout: 15000 });
  const ocrButtons = await page.locator('[data-action="study-ocr"]').allTextContents();
  assert.ok(
    ocrButtons.some(x => x.includes('broken-summary.pdf')),
    JSON.stringify(ocrButtons),
  );
  console.log('PASS: real PDF.js text extraction with page number and phone view');
  await page.close();
} finally {
  await browser.close();
}

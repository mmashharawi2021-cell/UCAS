// Synthetic text-only PDF for browser tests: `pages` pages of invented English filler,
// about `perPage` characters each, written as `lines` short lines (default 20) (Helvetica, no fonts embedded).
// Every line starts with its page and line number, so prefixes are easy to compare.
const LINES = 20;
const WORDS = 'spatial index raster vector layer query table field record map scale grid'.split(
  ' ',
);

function pageLines(n, perPage, count = LINES) {
  const width = Math.max(20, Math.floor(perPage / count));
  const lines = [];
  for (let l = 1; l <= count; l++) {
    let line = `p${n} l${l}`;
    for (let w = 0; line.length < width; w++) line += ' ' + WORDS[(n + l + w) % WORDS.length];
    lines.push(line.slice(0, width));
  }
  return lines;
}

/** Base64 of a valid PDF 1.4 file with `pages` text pages. */
export function makeTextPDF(pages, perPage = 1500, lines = LINES) {
  const fontId = 3;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    null,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const kids = [];
  for (let n = 1; n <= pages; n++) {
    const pageId = objects.length + 1;
    const contentId = pageId + 1;
    kids.push(pageId + ' 0 R');
    const body = pageLines(n, perPage, lines)
      .map((line, i) => (i ? 'T* ' : '') + '(' + line + ') Tj')
      .join('\n');
    const stream = 'BT /F1 7 Tf 10 TL 36 760 Td\n' + body + '\nET\n';
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      '<< /Length ' + Buffer.byteLength(stream) + ' >>\nstream\n' + stream + 'endstream',
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages} >>`;
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

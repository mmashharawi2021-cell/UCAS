// Import multiple-choice questions from plain text or CSV. Pure, offline.
//
// Text format (Arabic or English labels, one question per block):
//   س: ما هو المفتاح الأساسي؟
//   أ) حقل فريد يعرّف السجل
//   ب) جدول فرعي
//   ج) فهرس مكاني
//   د) نوع بيانات
//   الإجابة: أ
//   التفسير: ...   (optional)
//   المرجع: ...    (optional)
//
// CSV columns: question,a,b,c,d,answer,why,source  (answer = أ/ب/ج/د, A–D or 1–4)

export const MAX_IMPORT_QUESTIONS = 300;
const LETTERS = {
  أ: 0,
  ا: 0,
  ب: 1,
  ج: 2,
  د: 3,
  a: 0,
  b: 1,
  c: 2,
  d: 3,
  1: 0,
  2: 1,
  3: 2,
  4: 3,
};

export function answerIndex(value) {
  const key = String(value ?? '')
    .trim()
    .replace(/[)\].:-]/g, '')
    .toLowerCase();
  return key in LETTERS ? LETTERS[key] : -1;
}

function clean(text, max = 600) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const QUESTION = /^(?:س|سؤال|q|question)\s*\d*\s*[:：.-]\s*(.+)$/i;
const NUMBERED = /^\d+\s*[-.)]\s*(.+)$/;
const CHOICE = /^([أابجدabcd1-4])\s*[).:-]\s*(.+)$/i;
const ANSWER = /^(?:الإجابة|الاجابة|الجواب|الإجابة الصحيحة|answer)\s*[:：-]\s*(.+)$/i;
const WHY = /^(?:التفسير|الشرح|السبب|explanation|why)\s*[:：-]\s*(.+)$/i;
const SOURCE = /^(?:المرجع|المصدر|source|ref)\s*[:：-]\s*(.+)$/i;

function finish(block, out, errors, lineNo) {
  if (!block) return;
  const label = `السؤال قرب السطر ${lineNo}`;
  if (!block.question) return errors.push(`${label}: لا يوجد نص للسؤال`);
  if (block.choices.length < 2) return errors.push(`${label}: يحتاج خيارين على الأقل`);
  if (block.answer < 0 || block.answer >= block.choices.length)
    return errors.push(`${label}: الإجابة الصحيحة غير محددة أو غير موجودة بين الخيارات`);
  out.push({
    question: clean(block.question),
    choices: block.choices.slice(0, 4).map(c => clean(c, 300)),
    answer: block.answer,
    why: clean(block.why),
    source: clean(block.source, 200),
  });
}

export function parseQuestionText(text) {
  const lines = String(text || '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const questions = [];
  const errors = [];
  let block = null;
  let blockLine = 0;
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    let m;
    if ((m = ANSWER.exec(line)) && block) block.answer = answerIndex(m[1]);
    else if ((m = WHY.exec(line)) && block) block.why = m[1];
    else if ((m = SOURCE.exec(line)) && block) block.source = m[1];
    // A choice belongs to the open question until its answer line has been read;
    // after that, a line like "2. …" starts the next numbered question.
    else if ((m = CHOICE.exec(line)) && block && block.question && block.answer < 0)
      block.choices.push(m[2]);
    else if ((m = QUESTION.exec(line)) || (m = NUMBERED.exec(line))) {
      finish(block, questions, errors, blockLine);
      block = { question: m[1], choices: [], answer: -1, why: '', source: '' };
      blockLine = i + 1;
    } else if (block && !block.choices.length) block.question += ' ' + line;
  });
  finish(block, questions, errors, blockLine);
  return { questions: questions.slice(0, MAX_IMPORT_QUESTIONS), errors };
}

/** Minimal RFC 4180 CSV parser (quotes, escaped quotes, commas/newlines in quotes). */
export function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const src = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',' || ch === ';' || ch === '\t') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter(r => r.some(c => c.trim()));
}

export function parseQuestionCSV(text) {
  const rows = parseCSV(text);
  const questions = [];
  const errors = [];
  const header = rows[0]?.map(c => c.trim().toLowerCase()) || [];
  const hasHeader = header.includes('question') || header.includes('السؤال');
  rows.slice(hasHeader ? 1 : 0).forEach((r, i) => {
    const [question, a, b, c, d, answer, why, source] = r;
    const choices = [a, b, c, d].map(x => clean(x, 300)).filter(Boolean);
    const block = { question, choices, answer: answerIndex(answer), why, source };
    finish(block, questions, errors, i + 1 + (hasHeader ? 1 : 0));
  });
  return { questions: questions.slice(0, MAX_IMPORT_QUESTIONS), errors };
}

/** Pick the parser from the file name or the content. */
export function parseQuestions(text, filename = '') {
  if (/\.(csv|tsv)$/i.test(filename)) return parseQuestionCSV(text);
  const first = String(text || '').split('\n')[0] || '';
  if (/^\s*"?(question|السؤال)"?\s*[,;\t]/i.test(first)) return parseQuestionCSV(text);
  return parseQuestionText(text);
}

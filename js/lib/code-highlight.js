// Tiny, dependency-free syntax highlighter for code in notes (Python, JavaScript, SQL,
// C-like). Every token is HTML-escaped before it is wrapped, so pasted code can never
// inject markup.

const KEYWORDS = new Set(
  `and as assert async await break case catch class const continue def default del do elif else except export extends false finally for from function global if import in is lambda let new none nonlocal not null or pass print raise return self static switch this throw true try typeof var void while with yield
select insert update delete into values create table where join left right inner outer on group by order having limit as distinct alter drop index primary key foreign references not null and or union
int float double char bool boolean string void public private protected include using namespace std cout cin endl main`.split(
    /\s+/,
  ),
);
const BUILTINS = new Set(
  'len range input int str float list dict set tuple open type isinstance enumerate zip map filter sorted sum min max abs round print console log math document window'.split(
    ' ',
  ),
);

const esc = s =>
  s.replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

// Order matters: comments and strings first, so keywords inside them are not coloured.
const TOKEN =
  /(#[^\n]*|\/\/[^\n]*|--[^\n]*|\/\*[\s\S]*?\*\/)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)/g;

export function highlight(code, lang = '') {
  const sqlish = /sql/i.test(lang);
  let out = '';
  let last = 0;
  for (const m of code.matchAll(TOKEN)) {
    out += esc(code.slice(last, m.index));
    const [text, comment, string, number, word] = m;
    // In Python/JS "--" is not a comment; only treat it so for SQL blocks.
    if (comment && comment.startsWith('--') && !sqlish) {
      out += esc(text);
    } else if (comment) out += `<span class="tok-c">${esc(text)}</span>`;
    else if (string) out += `<span class="tok-s">${esc(text)}</span>`;
    else if (number) out += `<span class="tok-n">${esc(text)}</span>`;
    else if (
      word &&
      KEYWORDS.has(word.toLowerCase()) &&
      (sqlish || word === word.toLowerCase() || /^(True|False|None)$/.test(word))
    )
      out += `<span class="tok-k">${esc(text)}</span>`;
    else if (word && BUILTINS.has(word)) out += `<span class="tok-b">${esc(text)}</span>`;
    else out += esc(text);
    last = m.index + text.length;
  }
  return out + esc(code.slice(last));
}

/**
 * Split note text into prose and fenced code segments:
 *   ```python
 *   print("hi")
 *   ```
 * An unclosed fence runs to the end of the note.
 */
export function splitFences(text) {
  const parts = [];
  const re = /```([\w+#-]*)[^\n]*\n([\s\S]*?)(?:```|$)/g;
  let last = 0;
  for (const m of String(text || '').matchAll(re)) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
    parts.push({ type: 'code', lang: m[1] || '', value: m[2].replace(/\n$/, '') });
    last = m.index + m[0].length;
  }
  if (last < String(text || '').length) parts.push({ type: 'text', value: text.slice(last) });
  return parts;
}

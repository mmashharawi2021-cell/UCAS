import { highlight, splitFences } from '../lib/code-highlight.js?v=1.7.0';

// Phase 1 — lecture notes with highlight colours (course tab "ملاحظاتي").
// Note text is shown with escaping only; a tiny safe formatter turns **bold** and
// "- " bullets into markup AFTER escaping, so pasted HTML never runs.

export const COLORS = {
  '': 'بدون',
  yellow: 'أصفر',
  green: 'أخضر',
  blue: 'أزرق',
  pink: 'وردي',
};

/** Escape first, then apply a very small, safe subset of formatting. */
/** Notes with ``` fenced code: prose is formatted, code is highlighted, both escaped. */
export function formatNote(esc, text) {
  return splitFences(text)
    .map(part =>
      part.type === 'code'
        ? `<div class="code-block"><div class="code-head"><span>${esc(part.lang || 'code')}</span><button class="btn-mini" type="button" data-act="code-copy">نسخ</button></div><pre dir="ltr"><code>${highlight(part.value, part.lang)}</code></pre></div>`
        : formatProse(esc, part.value),
    )
    .join('');
}

function formatProse(esc, text) {
  return esc(text.replace(/^\n+|\n+$/g, ''))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/==(.+?)==/g, '<mark>$1</mark>')
    .split('\n')
    .map(line => (/^\s*[-•]\s+/.test(line) ? `<li>${line.replace(/^\s*[-•]\s+/, '')}</li>` : line))
    .join('\n')
    .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m.replace(/\n/g, '')}</ul>`)
    .replace(/\n/g, '<br>');
}

let filter = { query: '', color: '' };

function noteCard(ctx, n) {
  const { esc, ic, fmtDate } = ctx;
  return `<article class="note-card note-${esc(n.color || 'plain')}"><div class="note-head"><div class="grow"><h4>${n.pinned ? `${ic('award', 13)} ` : ''}${esc(n.title)}</h4><p class="muted tiny">${n.lecture ? `${esc(n.lecture)} · ` : ''}${fmtDate(n.updatedAt)}</p></div><div class="row-actions"><button class="btn-mini" data-act="note-pin" data-id="${esc(n.id)}" aria-label="${n.pinned ? 'إلغاء التثبيت' : 'تثبيت'}">${ic('award', 15)}</button><button class="btn-mini" data-act="note-edit" data-id="${esc(n.id)}" aria-label="تعديل">${ic('note', 15)}</button><button class="btn-mini" data-act="note-share" data-id="${esc(n.id)}" aria-label="مشاركة">${ic('share', 15)}</button><button class="btn-mini" data-act="note-delete" data-id="${esc(n.id)}" aria-label="حذف">${ic('trash', 15)}</button></div></div><div class="note-body">${formatNote(esc, n.body)}</div></article>`;
}

function renderTab(ctx, course) {
  const { state, esc, ic, noData } = ctx;
  const q = filter.query.trim().toLowerCase();
  const notes = state.notes
    .filter(n => n.courseId === course.id)
    .filter(n => !filter.color || n.color === filter.color)
    .filter(n => !q || `${n.title} ${n.body} ${n.lecture || ''}`.toLowerCase().includes(q))
    .sort(
      (a, b) =>
        (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
        String(b.updatedAt).localeCompare(String(a.updatedAt)),
    );
  const total = state.notes.filter(n => n.courseId === course.id).length;
  return `<div class="page-intro"><div><h2>ملاحظاتي على المحاضرات</h2><p>اكتب ملخصاتك وظلّل المهم بالألوان. اكتب **نص** للخط العريض و ==نص== للتظليل و - للنقاط، وضع الكود بين \`\`\` لتلوينه.</p></div><button class="primary-btn" data-act="note-add">${ic('plus')} ملاحظة جديدة</button></div>${
    total
      ? `<div class="notes-toolbar"><input class="input" type="search" placeholder="ابحث في ملاحظات المساق…" value="${esc(filter.query)}" data-act-change="note-filter-query" aria-label="بحث في الملاحظات"/><div class="color-filter" role="group" aria-label="تصفية حسب اللون">${Object.entries(
          COLORS,
        )
          .map(
            ([k, v]) =>
              `<button class="swatch swatch-${k || 'all'} ${filter.color === k ? 'active' : ''}" data-act="note-filter-color" data-color="${k}" title="${k ? v : 'الكل'}" aria-label="${k ? v : 'كل الألوان'}"></button>`,
          )
          .join('')}</div></div>`
      : ''
  }<div class="notes-grid">${notes.map(n => noteCard(ctx, n)).join('') || noData(total ? 'لا توجد نتائج' : 'لا توجد ملاحظات بعد', total ? 'غيّر كلمة البحث أو اللون' : 'ابدأ بتلخيص أول محاضرة', 'note')}</div>`;
}

function noteModal(ctx, note = null) {
  const { modal, esc, ic, state } = ctx;
  const lectures = [
    ...new Set(
      state.resources.filter(r => r.courseId === state.courseId).map(r => r.module || r.name),
    ),
  ].slice(0, 60);
  const n = note || { title: '', body: '', color: '', lecture: '' };
  modal(
    note ? 'تعديل الملاحظة' : 'ملاحظة جديدة',
    `<form id="note-form"><input type="hidden" name="id" value="${esc(n.id || '')}"/><div class="field"><label for="note-title">العنوان</label><input id="note-title" class="input" name="title" maxlength="150" required value="${esc(n.title)}" placeholder="مثال: ملخص المحاضرة الثالثة"/></div><div class="form-grid"><div class="field"><label for="note-lecture">المحاضرة (اختياري)</label><input id="note-lecture" class="input" name="lecture" maxlength="150" list="note-lectures" value="${esc(n.lecture || '')}"/><datalist id="note-lectures">${lectures.map(l => `<option value="${esc(l)}"></option>`).join('')}</datalist></div><div class="field"><label>لون التظليل</label><div class="color-filter">${Object.entries(
      COLORS,
    )
      .map(
        ([k, v]) =>
          `<label class="swatch-pick" title="${v}"><input type="radio" name="color" value="${k}" ${k === (n.color || '') ? 'checked' : ''}/><span class="swatch swatch-${k || 'all'}"></span></label>`,
      )
      .join(
        '',
      )}</div></div></div><div class="field"><label for="note-body">الملاحظة</label><textarea id="note-body" class="textarea" name="body" rows="10" maxlength="20000" placeholder="- نقطة مهمة&#10;**مصطلح**: تعريفه&#10;==جملة مهمة للامتحان==">${esc(n.body)}</textarea></div><button class="primary-btn" type="submit">${ic('check')} حفظ الملاحظة</button></form>`,
    true,
  );
}

export const courseTabs = [{ id: 'notes', label: 'ملاحظاتي', render: renderTab }];

export const actions = {
  'code-copy': async (el, ctx) => {
    const code = el.closest('.code-block')?.querySelector('code')?.textContent || '';
    try {
      await navigator.clipboard.writeText(code);
      ctx.toast('تم نسخ الكود');
    } catch {
      ctx.toast('تعذر النسخ', true);
    }
  },
  'note-add': (el, ctx) => noteModal(ctx),
  'note-edit': (el, ctx) => {
    const n = ctx.state.notes.find(x => x.id === el.dataset.id);
    if (n) noteModal(ctx, n);
  },
  'note-delete': async (el, ctx) => {
    if (!confirm('حذف هذه الملاحظة؟')) return;
    await ctx.remove('notes', el.dataset.id);
    await ctx.refresh();
  },
  'note-pin': async (el, ctx) => {
    const n = ctx.state.notes.find(x => x.id === el.dataset.id);
    if (!n) return;
    await ctx.put('notes', { ...n, pinned: !n.pinned });
    await ctx.refresh();
  },
  'note-share': async (el, ctx) => {
    const n = ctx.state.notes.find(x => x.id === el.dataset.id);
    if (!n) return;
    const text = `${n.title}\n${ctx.courseName(n.courseId)}\n\n${n.body}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: n.title, text });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      ctx.toast('تم نسخ الملاحظة، ألصقها في المحادثة');
    } catch {
      ctx.toast('تعذرت المشاركة من هذا المتصفح', true);
    }
  },
  'note-filter-color': (el, ctx) => {
    filter.color = filter.color === el.dataset.color ? '' : el.dataset.color;
    ctx.render();
  },
};

export const changes = {
  'note-filter-query': (el, ctx) => {
    filter.query = el.value;
    ctx.render();
    const input = document.querySelector('[data-act-change="note-filter-query"]');
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  },
};

export const forms = {
  'note-form': async (form, ctx) => {
    const fd = new FormData(form);
    const id = String(fd.get('id') || '');
    const existing = ctx.state.notes.find(n => n.id === id);
    const now = new Date().toISOString();
    const color = String(fd.get('color') || '');
    await ctx.put('notes', {
      ...(existing || {}),
      id: id || ctx.makeId(),
      courseId: existing?.courseId || ctx.state.courseId,
      title: String(fd.get('title') || '').trim() || 'ملاحظة',
      lecture: String(fd.get('lecture') || '').trim(),
      body: String(fd.get('body') || ''),
      color: color in COLORS ? color : '',
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
    ctx.closeModal();
    await ctx.refresh();
    ctx.toast('تم حفظ الملاحظة');
  },
};

// Phase 4 — share a course with classmates as a "course pack" file (no server).
import { buildPack, readPack, dedupeKey } from '../lib/pack.js?v=1.1.0';

let pending = null; // { courseId, data, fileName }

function courseActions(ctx, course) {
  const { ic, esc } = ctx;
  return `<button class="outline-btn share-course-btn" data-act="pack-open" data-id="${esc(course.id)}">${ic('users', 16)} مشاركة مع الزملاء</button>`;
}

function packModal(ctx, courseId) {
  const { modal, ic, esc, state, courseName } = ctx;
  const counts = {
    notes: state.notes.filter(n => n.courseId === courseId).length,
    questions: state.questionBank.filter(q => q.courseId === courseId).length,
    schedule: state.schedule.filter(s => s.courseId === courseId).length,
    exams: state.exams.filter(e => e.courseId === courseId).length,
  };
  const labels = {
    notes: 'الملاحظات',
    questions: 'أسئلتي',
    schedule: 'مواعيد المحاضرات',
    exams: 'مواعيد الامتحانات',
  };
  modal(
    `مشاركة: ${courseName(courseId)}`,
    `<div class="share-grid"><section><h3>${ic('share', 17)} أرسل حزمة لزميلك</h3><p class="muted tiny">تُنشأ حزمة صغيرة يمكنك إرسالها عبر واتساب أو تيليجرام أو Drive. لا تتضمن ملفاتك ولا علاماتك ولا سجل اختباراتك.</p><form id="pack-export-form"><input type="hidden" name="courseId" value="${esc(courseId)}"/>${Object.entries(
      labels,
    )
      .map(
        ([k, v]) =>
          `<label class="toggle-line"><input type="checkbox" name="${k}" ${counts[k] ? 'checked' : 'disabled'}/> ${v} <span class="pill">${counts[k]}</span></label>`,
      )
      .join(
        '',
      )}<button class="primary-btn" type="submit">${ic('share')} مشاركة الحزمة</button></form></section><section><h3>${ic('download', 17)} استقبل حزمة من زميل</h3><p class="muted tiny">اختر ملف <bdi>.ucaspack.json</bdi> الذي وصلك. ستُضاف محتوياته إلى هذا المساق دون حذف أي شيء، وتُتجاهل المكررات.</p><input class="input" type="file" accept=".json,application/json" data-act-change="pack-file" data-id="${esc(courseId)}" aria-label="ملف الحزمة"/><div id="pack-preview"></div></section></div><p class="muted tiny">للدردشة المباشرة مع زملائك استخدم <button class="link" data-go="groups">مجموعات الدراسة</button>.</p>`,
    true,
  );
}

function previewHTML(ctx) {
  const { esc, ic } = ctx;
  if (!pending) return '';
  const d = pending.data;
  return `<div class="notice info"><strong>${esc(d.courseTitle || 'حزمة مساق')}</strong><ul class="bullet-list"><li>${d.notes.length} ملاحظة</li><li>${d.questions.length} سؤال</li><li>${d.schedule.length} موعد محاضرة</li><li>${d.exams.length} موعد امتحان</li></ul><p class="tiny">راجع المحتوى بعد الاستيراد؛ مصدره زميلك وليس الكلية.</p><button class="primary-btn" data-act="pack-import">${ic('check')} استيراد إلى المساق</button></div>`;
}

export const courseActionButtons = [courseActions];

export const actions = {
  'pack-open': (el, ctx) => {
    pending = null;
    packModal(ctx, el.dataset.id);
  },
  'pack-import': async (el, ctx) => {
    if (!pending) return;
    const { courseId, data } = pending;
    const { state } = ctx;
    const now = new Date().toISOString();
    let added = 0;
    const have = (list, key) => new Set(list.filter(x => x.courseId === courseId).map(key));

    const notes = have(state.notes, dedupeKey.note);
    for (const n of data.notes)
      if (!notes.has(dedupeKey.note(n))) {
        await ctx.put('notes', {
          ...n,
          id: ctx.makeId(),
          courseId,
          shared: true,
          createdAt: now,
          updatedAt: now,
        });
        added++;
      }
    const slots = have(state.schedule, dedupeKey.slot);
    for (const s of data.schedule)
      if (!slots.has(dedupeKey.slot(s))) {
        await ctx.put('schedule', { ...s, id: ctx.makeId(), courseId, type: s.type || 'lecture' });
        added++;
      }
    const exams = have(state.exams, dedupeKey.exam);
    for (const e of data.exams)
      if (!exams.has(dedupeKey.exam(e))) {
        await ctx.put('exams', { ...e, id: ctx.makeId(), courseId, type: e.type || 'other' });
        added++;
      }
    const questions = have(state.questionBank, dedupeKey.question);
    const fresh = data.questions
      .filter(q => !questions.has(dedupeKey.question(q)))
      .map(q => ({ ...q, id: ctx.makeId(), courseId }));
    if (fresh.length) await ctx.saveQuestionBank([...state.questionBank, ...fresh]);
    added += fresh.length;

    pending = null;
    ctx.closeModal();
    await ctx.refresh();
    ctx.toast(added ? `أُضيف ${added} عنصر من الحزمة` : 'كل محتوى الحزمة موجود مسبقًا');
  },
};

export const changes = {
  'pack-file': async (el, ctx) => {
    const file = el.files?.[0];
    const slot = document.getElementById('pack-preview');
    pending = null;
    if (!file) return;
    try {
      if (file.size > 3 * 1024 * 1024) throw new Error('الملف أكبر من 3 ميغابايت');
      const data = readPack(JSON.parse(await file.text()));
      pending = { courseId: el.dataset.id, data, fileName: file.name };
      if (slot) slot.innerHTML = previewHTML(ctx);
    } catch (err) {
      if (slot)
        slot.innerHTML = `<div class="notice warn">${ctx.esc(err instanceof SyntaxError ? 'الملف ليس JSON صالحًا' : err.message)}</div>`;
    }
  },
};

export const forms = {
  'pack-export-form': async (form, ctx) => {
    const fd = new FormData(form);
    const courseId = String(fd.get('courseId'));
    const course = ctx.state.courses.find(c => c.id === courseId);
    const pick = (name, list) => (fd.get(name) ? list.filter(x => x.courseId === courseId) : []);
    const pack = buildPack({
      course,
      notes: pick('notes', ctx.state.notes),
      questions: pick('questions', ctx.state.questionBank),
      schedule: pick('schedule', ctx.state.schedule),
      exams: pick('exams', ctx.state.exams),
    });
    const safe = (course?.title || 'course').replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40);
    const result = await ctx.deliverFile(
      `${safe}.ucaspack.json`,
      JSON.stringify(pack),
      'application/json',
      `حزمة مساق: ${course?.title || ''}`,
    );
    if (result !== 'cancelled')
      ctx.toast(result === 'shared' ? 'تمت المشاركة' : 'تم تنزيل الحزمة؛ أرسل الملف لزميلك');
  },
};

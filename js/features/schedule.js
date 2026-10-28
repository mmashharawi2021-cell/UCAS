// Phase 1 — weekly lecture timetable.
import {
  DAYS,
  SLOT_TYPES,
  validateSlot,
  sortSlots,
  conflictsWith,
  todaySlots,
  nextSlot,
  weeklyMinutesByCourse,
} from '../lib/timetable.js?v=1.7.0';
import { formatMinutes } from '../lib/focus.js?v=1.7.0';

// UCAS week: Saturday → Friday.
const WEEK_ORDER = [6, 0, 1, 2, 3, 4, 5];

function slotCard(ctx, slot) {
  const { esc, ic, state, courseName } = ctx;
  const clash = conflictsWith(state.schedule, slot).length;
  return `<article class="slot-card"><div class="slot-time"><strong>${esc(slot.start)}</strong><span>${esc(slot.end)}</span></div><div class="grow"><h4>${esc(courseName(slot.courseId))}</h4><p class="muted tiny">${esc(SLOT_TYPES[slot.type] || SLOT_TYPES.lecture)}${slot.room ? ` · ${esc(slot.room)}` : ''}${slot.lecturer ? ` · ${esc(slot.lecturer)}` : ''}</p>${clash ? `<span class="pill warn">${ic('alert', 12)} تعارض في الوقت</span>` : ''}</div><div class="row-actions"><button class="btn-mini" data-act="slot-edit" data-id="${esc(slot.id)}" aria-label="تعديل">${ic('note', 15)}</button><button class="btn-mini" data-act="slot-delete" data-id="${esc(slot.id)}" aria-label="حذف">${ic('trash', 15)}</button></div></article>`;
}

function render(ctx) {
  const { state, intro, ic, esc, noData, sectionHead, courseName } = ctx;
  const today = new Date().getDay();
  const add = `<button class="primary-btn" data-act="slot-add">${ic('plus')} إضافة محاضرة</button>`;
  if (!state.schedule.length)
    return `${intro('جدول المحاضرات', 'أدخل مواعيد محاضراتك الأسبوعية مرة واحدة ليظهر جدولك تلقائيًا كل يوم', add)}<div class="panel">${noData('لا يوجد جدول بعد', 'أضف أول محاضرة: اليوم والوقت والقاعة', 'grid')}</div>`;
  const days = WEEK_ORDER.filter(d => d !== 5 || state.schedule.some(s => s.day === 5));
  const hours = weeklyMinutesByCourse(state.schedule);
  return `${intro('جدول المحاضرات', 'جدولك الأسبوعي. اليوم مظلل، والتعارضات تظهر بعلامة تحذير', add)}<div class="timetable">${days
    .map(day => {
      const slots = sortSlots(state.schedule.filter(s => s.day === day));
      return `<section class="day-column ${day === today ? 'is-today' : ''}"><h3>${DAYS[day]}${day === today ? ' <span class="pill success">اليوم</span>' : ''}</h3>${slots.length ? slots.map(s => slotCard(ctx, s)).join('') : '<p class="muted tiny day-empty">لا محاضرات</p>'}</section>`;
    })
    .join('')}</div>${sectionHead('الساعات الأسبوعية لكل مساق')}<div class="panel">${Object.entries(
    hours,
  )
    .map(
      ([id, minutes]) =>
        `<div class="item-row"><div><h4>${esc(courseName(id))}</h4></div><span class="pill">${formatMinutes(minutes)} أسبوعيًا</span></div>`,
    )
    .join(
      '',
    )}</div><div class="row-actions" style="margin-top:16px"><button class="outline-btn" data-act="calendar-export">${ic('calendar')} إضافة الجدول إلى تقويم الهاتف</button></div>`;
}

function slotModal(ctx, slot = null) {
  const { modal, courseOption, esc, ic, state } = ctx;
  const s = slot || { day: new Date().getDay(), start: '08:00', end: '09:30', type: 'lecture' };
  modal(
    slot ? 'تعديل محاضرة' : 'محاضرة جديدة في الجدول',
    `<form id="slot-form"><input type="hidden" name="id" value="${esc(s.id || '')}"/><div class="field"><label for="slot-course">المساق</label><select id="slot-course" class="select" name="courseId" required><option value="">اختر المساق</option>${courseOption(s.courseId || state.courseId)}</select></div><div class="form-grid"><div class="field"><label for="slot-day">اليوم</label><select id="slot-day" class="select" name="day">${WEEK_ORDER.map(d => `<option value="${d}" ${d === s.day ? 'selected' : ''}>${DAYS[d]}</option>`).join('')}</select></div><div class="field"><label for="slot-type">النوع</label><select id="slot-type" class="select" name="type">${Object.entries(
      SLOT_TYPES,
    )
      .map(([k, v]) => `<option value="${k}" ${k === s.type ? 'selected' : ''}>${v}</option>`)
      .join(
        '',
      )}</select></div><div class="field"><label for="slot-start">من</label><input id="slot-start" class="input" type="time" name="start" required value="${esc(s.start)}"/></div><div class="field"><label for="slot-end">إلى</label><input id="slot-end" class="input" type="time" name="end" required value="${esc(s.end)}"/></div><div class="field"><label for="slot-room">القاعة (اختياري)</label><input id="slot-room" class="input" name="room" maxlength="60" value="${esc(s.room || '')}" placeholder="مثال: B204"/></div><div class="field"><label for="slot-lecturer">المحاضر (اختياري)</label><input id="slot-lecturer" class="input" name="lecturer" maxlength="80" value="${esc(s.lecturer || '')}"/></div></div><label class="toggle-line"><input type="checkbox" name="repeat"/> أضف نفس الموعد لأيام أخرى بعد الحفظ</label><button class="primary-btn" type="submit">${ic('check')} حفظ</button></form>`,
  );
}

function homeWidget(ctx) {
  const { state, esc, ic, courseName } = ctx;
  if (!state.schedule.length)
    return `<div class="widget"><div class="widget-head"><h3>${ic('grid', 17)} محاضرات اليوم</h3></div><p class="muted tiny">لم تُدخل جدول محاضراتك بعد.</p><button class="outline-btn" data-go="schedule">${ic('plus', 15)} إنشاء الجدول</button></div>`;
  const today = todaySlots(state.schedule);
  const next = nextSlot(state.schedule);
  const list = today.length
    ? today
        .map(
          s =>
            `<div class="mini-row ${s.status}"><span class="mini-time">${esc(s.start)}</span><span class="grow">${esc(courseName(s.courseId))}${s.room ? ` · ${esc(s.room)}` : ''}</span><span class="pill ${s.status === 'now' ? 'success' : ''}">${s.status === 'done' ? 'انتهت' : s.status === 'now' ? 'الآن' : 'قادمة'}</span></div>`,
        )
        .join('')
    : `<p class="muted tiny">لا محاضرات اليوم.${next ? ` المحاضرة القادمة: ${esc(courseName(next.slot.courseId))} يوم ${DAYS[next.slot.day]} ${esc(next.slot.start)}.` : ''}</p>`;
  return `<div class="widget"><div class="widget-head"><h3>${ic('grid', 17)} محاضرات اليوم</h3><button class="link" data-go="schedule">الجدول</button></div>${list}</div>`;
}

export const pages = [
  { id: 'schedule', title: 'جدول المحاضرات', label: 'جدول المحاضرات', icon: 'grid', render },
];
export const homeWidgets = [homeWidget];

export const actions = {
  'slot-add': (el, ctx) => slotModal(ctx),
  'slot-edit': (el, ctx) => {
    const slot = ctx.state.schedule.find(s => s.id === el.dataset.id);
    if (slot) slotModal(ctx, slot);
  },
  'slot-delete': async (el, ctx) => {
    if (!confirm('حذف هذه المحاضرة من الجدول؟')) return;
    await ctx.remove('schedule', el.dataset.id);
    await ctx.refresh();
  },
};

export const forms = {
  'slot-form': async (form, ctx) => {
    const fd = new FormData(form);
    const slot = {
      id: String(fd.get('id') || '') || ctx.makeId(),
      courseId: String(fd.get('courseId') || ''),
      day: Number(fd.get('day')),
      start: String(fd.get('start') || ''),
      end: String(fd.get('end') || ''),
      type: SLOT_TYPES[fd.get('type')] ? String(fd.get('type')) : 'lecture',
      room: String(fd.get('room') || '').trim(),
      lecturer: String(fd.get('lecturer') || '').trim(),
    };
    const error = validateSlot(slot);
    if (error) throw new Error(error);
    await ctx.put('schedule', slot);
    const clash = conflictsWith(ctx.state.schedule, slot).length;
    await ctx.refresh();
    ctx.toast(
      clash ? 'تم الحفظ — يوجد تعارض مع محاضرة أخرى في نفس الوقت' : 'تم حفظ المحاضرة',
      !!clash,
    );
    if (fd.get('repeat')) slotModal(ctx, { ...slot, id: undefined, day: (slot.day + 2) % 7 });
    else ctx.closeModal();
  },
};

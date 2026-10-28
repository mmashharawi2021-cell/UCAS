// Phase 3 — weekly report.
import { weeklyReport, reportText } from '../lib/report.js?v=1.6.0';
import { formatMinutes } from '../lib/focus.js?v=1.6.0';

let offset = 0;

function render(ctx) {
  const { state, intro, stat, esc, ic, sectionHead, noData, courseName, fmtDate } = ctx;
  const r = weeklyReport(state, new Date(), offset);
  const fmt = d => d.toLocaleDateString('ar', { day: 'numeric', month: 'long' });
  const end = new Date(r.range.end.getTime() - 86400000);
  const max = Math.max(1, ...r.perCourse.map(c => c.minutes));
  return `${intro('التقرير الأسبوعي', `${fmt(r.range.start)} – ${fmt(end)}`, `<div class="row-actions"><button class="outline-btn" data-act="report-week" data-step="-1" aria-label="الأسبوع السابق">${ic('chevron', 15)} السابق</button>${offset < 0 ? `<button class="outline-btn" data-act="report-week" data-step="1">التالي</button>` : ''}</div>`)}<div class="stats-grid">${stat('timer', formatMinutes(r.studyMinutes), 'وقت المذاكرة')}${stat('check', r.tasksDone, 'تكليفات أُنجزت')}${stat('quiz', r.attempts + (r.average !== null ? ` · ${r.average}%` : ''), 'اختبارات تدريبية')}${stat('note', r.notes, 'ملاحظات')}</div>${r.streak !== null ? `<div class="notice info">${ic('award', 15)} ${r.streak ? `أنت تذاكر منذ ${r.streak} يوم متتالٍ. استمر!` : 'ابدأ جلسة تركيز اليوم لتبدأ سلسلة أيام متتالية.'}</div>` : ''}${sectionHead('حسب المساق')}<div class="panel">${
    r.perCourse.length
      ? r.perCourse
          .map(
            c =>
              `<div><div class="bar-row"><strong>${esc(c.title)}</strong><span class="muted">${formatMinutes(c.minutes)} · ${c.attempts} اختبار · ${c.notes} ملاحظة</span></div><div class="progress-track"><div style="width:${Math.round((c.minutes / max) * 100)}%"></div></div></div>`,
          )
          .join('')
      : noData(
          'لا نشاط مسجل في هذا الأسبوع',
          'استخدم مؤقت المذاكرة والاختبارات والملاحظات ليظهر نشاطك هنا',
          'report',
        )
  }</div>${
    r.overdue.length
      ? `${sectionHead('تكليفات متأخرة')}<div class="panel">${r.overdue
          .map(
            t =>
              `<div class="item-row"><div><h4>${esc(t.title)}</h4><p>${esc(courseName(t.courseId))} · ${fmtDate(t.due)}</p></div><span class="pill warn">متأخر</span></div>`,
          )
          .join('')}</div>`
      : ''
  }${
    r.examsAhead.length
      ? `${sectionHead('امتحانات خلال الأسبوع القادم')}<div class="panel">${r.examsAhead
          .map(
            e =>
              `<div class="item-row"><div><h4>${esc(e.title)}</h4><p>${esc(courseName(e.courseId))} · ${fmtDate(e.date)}</p></div></div>`,
          )
          .join('')}</div>`
      : ''
  }<div class="row-actions" style="margin-top:18px"><button class="primary-btn" data-act="report-share">${ic('share')} مشاركة التقرير</button><button class="outline-btn" data-act="report-print">${ic('download')} طباعة / PDF</button></div>`;
}

export const pages = [
  { id: 'report', title: 'التقرير الأسبوعي', label: 'التقرير الأسبوعي', icon: 'report', render },
];

export const actions = {
  'report-week': (el, ctx) => {
    offset = Math.min(0, offset + Number(el.dataset.step || 0));
    ctx.render();
  },
  'report-print': () => window.print(),
  'report-share': async (el, ctx) => {
    const text = reportText(weeklyReport(ctx.state, new Date(), offset), ctx.courseName);
    if (navigator.share) {
      try {
        await navigator.share({ title: 'تقريري الدراسي الأسبوعي', text });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      ctx.toast('تم نسخ التقرير');
    } catch {
      ctx.toast('تعذرت المشاركة من هذا المتصفح', true);
    }
  },
};

// Feature registry. Each module in this folder may export any of:
//   pages[]             { id, title, label, icon, render(ctx) } — a top-level page
//   homeWidgets[]       (ctx) => html — cards on the home page
//   courseTabs[]        { id, label, render(ctx, course) } — extra tabs on a course page
//   courseActionButtons[] (ctx, course) => html — buttons in the course header
//   settingsPanels[]    (ctx) => html — panels on the settings page
//   actions{}           name → (el, ctx, event) — clicks on [data-act="name"]
//   changes{}           name → (el, ctx, event) — change events on [data-act-change="name"]
//   forms{}             formId → (form, ctx) — submit of <form id="formId">
//   start(ctx)          called once after the first data load
//   onQuizFinished(quiz, ctx) — after a practice quiz is saved
import * as schedule from './schedule.js';
import * as notes from './notes.js';
import * as focus from './focus.js';
import * as exams from './exams.js';
import * as grades from './grades.js';
import * as report from './report.js';
import * as share from './share.js';
import * as reminders from './reminders.js';
import * as groups from './groups.js';
import * as push from './push.js';

const modules = [schedule, notes, focus, exams, grades, report, share, reminders, push, groups];
const collect = key => modules.flatMap(m => m[key] || []);
const lookup = key => Object.assign({}, ...modules.map(m => m[key] || {}));

const actions = lookup('actions');
const changes = lookup('changes');
const forms = lookup('forms');
const widgets = collect('homeWidgets');
const courseButtons = collect('courseActionButtons');
const panels = collect('settingsPanels');

export const features = {
  pages: collect('pages'),
  courseTabs: collect('courseTabs'),
  homeWidgets: ctx => {
    const html = widgets.map(w => w(ctx)).join('');
    return html ? `<div class="home-widgets">${html}</div>` : '';
  },
  courseActions: (ctx, course) =>
    courseButtons.length
      ? `<div class="course-actions">${courseButtons.map(b => b(ctx, course)).join('')}</div>`
      : '',
  settingsPanels: ctx => panels.map(p => p(ctx)).join(''),
  click: async (name, el, ctx, event) => {
    if (!actions[name]) return console.warn('Unknown action', name);
    await actions[name](el, ctx, event);
  },
  change: async (name, el, ctx, event) => {
    if (changes[name]) await changes[name](el, ctx, event);
  },
  hasForm: id => !!id && Object.hasOwn(forms, id),
  submit: (form, ctx) => forms[form.getAttribute('id')](form, ctx),
  start: ctx => {
    for (const m of modules) {
      try {
        m.start?.(ctx);
      } catch (err) {
        console.error(err);
      }
    }
  },
  quizFinished: async (quiz, ctx) => {
    for (const m of modules) await m.onQuizFinished?.(quiz, ctx);
  },
};

// Study groups with live chat (online, optional). Accounts are nickname-only
// (Supabase anonymous sign-in). Only the nickname, group names and messages are stored
// on the server; local study data never leaves the device through this feature.
import { ensureSession, hasStoredSession, run, CloudError } from '../cloud/client.js?v=1.6.0';
import {
  validateNickname,
  normalizeInviteCode,
  formatInviteCode,
  inviteLink,
  readLaunchParams,
  validateMessage,
  messageTime,
} from '../lib/cloud.js?v=1.6.0';

const CONSENT_KEY = 'ucas-cloud-consent';
const PAGE = 50;

const s = {
  status: 'idle', // idle | connecting | ready | error
  error: '',
  sb: null,
  user: null,
  profile: null,
  groups: [],
  active: null,
  messages: [],
  hasOlder: false,
  names: {},
  memberCount: 0,
  channel: null,
  prefillCode: '',
  openGroupId: null,
  editingNickname: false,
};
let ctxRef = null;

function consented() {
  try {
    return localStorage.getItem(CONSENT_KEY) === '1' || hasStoredSession();
  } catch {
    return false;
  }
}

// ---------- data ----------
async function connect(ctx) {
  if (s.status === 'connecting') return;
  s.status = 'connecting';
  s.error = '';
  ctx.render();
  try {
    const { sb, user } = await ensureSession();
    s.sb = sb;
    s.user = user;
    const rows = await run(sb.from('profiles').select('id, nickname').eq('id', user.id));
    s.profile = rows[0] || null;
    if (s.profile) await loadGroups();
    s.status = 'ready';
    if (s.prefillCode && s.profile) await joinByCode(ctx, s.prefillCode, true);
    if (s.openGroupId && s.groups.some(g => g.id === s.openGroupId))
      await openGroup(ctx, s.openGroupId);
    s.openGroupId = null;
  } catch (err) {
    s.status = 'error';
    s.error = err instanceof CloudError ? err.message : 'تعذر الاتصال';
    console.error(err);
  }
  ctx.render();
}

async function loadGroups() {
  const rows = await run(
    s.sb
      .from('group_members')
      .select('role, groups(id, name, course, invite_code, created_by, created_at)')
      .eq('user_id', s.user.id),
  );
  s.groups = rows
    .filter(r => r.groups)
    .map(r => ({ ...r.groups, role: r.role }))
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

async function loadNames(groupId) {
  const members = await run(s.sb.from('group_members').select('user_id').eq('group_id', groupId));
  s.memberCount = members.length;
  const ids = members.map(m => m.user_id).filter(id => !s.names[id]);
  if (ids.length) {
    const profiles = await run(s.sb.from('profiles').select('id, nickname').in('id', ids));
    for (const p of profiles) s.names[p.id] = p.nickname;
  }
}

async function openGroup(ctx, groupId) {
  closeChannel();
  s.active = s.groups.find(g => g.id === groupId) || null;
  if (!s.active) return;
  s.messages = [];
  ctx.render();
  const [rows] = await Promise.all([
    run(
      s.sb
        .from('messages')
        .select('id, user_id, body, created_at')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(PAGE),
    ),
    loadNames(groupId),
  ]);
  s.messages = rows.reverse();
  s.hasOlder = rows.length === PAGE;
  s.channel = s.sb
    .channel(`group:${groupId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages', filter: `group_id=eq.${groupId}` },
      payload => onIncoming(payload.new),
    )
    .subscribe();
  ctx.render();
  scrollChat();
}

function closeChannel() {
  if (s.channel && s.sb) s.sb.removeChannel(s.channel);
  s.channel = null;
}

async function onIncoming(msg) {
  if (!s.active || msg.group_id !== s.active.id || s.messages.some(m => m.id === msg.id)) return;
  if (!s.names[msg.user_id]) await loadNames(s.active.id).catch(() => {});
  s.messages.push(msg);
  const list = document.getElementById('chat-list');
  if (!list) return;
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
  list.querySelector('.chat-empty')?.remove();
  list.insertAdjacentHTML('beforeend', messageHTML(ctxRef, msg));
  if (nearBottom || msg.user_id === s.user?.id) scrollChat();
}

async function joinByCode(ctx, input, silent = false) {
  const code = normalizeInviteCode(input);
  if (!code) throw new Error('رمز الدعوة يتكون من 8 أحرف وأرقام');
  const group = await run(s.sb.rpc('join_group', { p_code: code }));
  s.prefillCode = '';
  await loadGroups();
  if (!silent) ctx.toast(`انضممت إلى ${group.name}`);
  await openGroup(ctx, group.id);
}

function scrollChat() {
  requestAnimationFrame(() => {
    const list = document.getElementById('chat-list');
    if (list) list.scrollTop = list.scrollHeight;
  });
}

// ---------- views ----------
function messageHTML(ctx, m) {
  const { esc } = ctx;
  const mine = m.user_id === s.user?.id;
  return `<div class="chat-msg ${mine ? 'mine' : ''}" data-msg="${esc(m.id)}">${mine ? '' : `<span class="chat-author">${esc(s.names[m.user_id] || 'عضو')}</span>`}<p>${esc(m.body)}</p><time datetime="${esc(m.created_at)}">${esc(messageTime(m.created_at))}</time></div>`;
}

function introView(ctx) {
  const { ic, intro } = ctx;
  return `${intro('مجموعات الدراسة', 'ذاكر مع زملائك: أنشئ مجموعة لمساق وادعُهم برمز أو رابط، وتحدثوا مباشرة')}<div class="panel groups-intro"><h3>${ic('users', 18)} قبل أن تبدأ</h3><ul class="bullet-list"><li>تتصل هذه الميزة بخادم Supabase وتحتاج إنترنت. المزامنة ومساعد AI خدمات سحابية اختيارية أخرى.</li><li>لا يُطلب بريد أو رقم هاتف؛ تختار <strong>اسمًا مستعارًا</strong> فقط.</li><li>يُحفظ على الخادم: اسمك المستعار، أسماء المجموعات، والرسائل. ملفاتك وعلاماتك وملاحظاتك تبقى على جهازك.</li><li>لا يرى الرسائل إلا أعضاء المجموعة. لا ترسل بيانات شخصية أو كلمات مرور.</li><li>حسابك مرتبط بهذا المتصفح: إذا مسحت بيانات الموقع تفقد الوصول للمجموعات (يمكنك الانضمام مجددًا بالرمز).</li></ul><button class="primary-btn" data-act="groups-connect">${ic('check')} موافق، ابدأ</button></div>`;
}

function nicknameView(ctx) {
  const { ic, intro, esc } = ctx;
  return `${intro('مجموعات الدراسة', 'اختر الاسم الذي سيظهر لزملائك')}<form id="nickname-form" class="panel"><div class="field"><label for="nick">اسمك المستعار</label><input id="nick" class="input" name="nickname" minlength="2" maxlength="30" required autocomplete="nickname" placeholder="مثال: أحمد - GIS" value="${esc(s.profile?.nickname || '')}"/></div><button class="primary-btn" type="submit">${ic('check')} حفظ</button></form>`;
}

function listView(ctx) {
  const { ic, intro, esc, noData, state } = ctx;
  const courseList = state.courses.map(c => `<option value="${esc(c.title)}"></option>`).join('');
  const forms = `<div class="groups-forms"><form id="group-join-form" class="panel"><h3>${ic('link', 17)} انضم بمجموعة</h3><div class="field"><label for="join-code">رمز الدعوة أو الرابط</label><input id="join-code" class="input code-input" name="code" required autocomplete="off" placeholder="ABCD-EF23" value="${esc(s.prefillCode ? formatInviteCode(s.prefillCode) : '')}"/></div><button class="primary-btn" type="submit">انضمام</button></form><form id="group-create-form" class="panel"><h3>${ic('plus', 17)} أنشئ مجموعة</h3><div class="field"><label for="group-name">اسم المجموعة</label><input id="group-name" class="input" name="name" minlength="2" maxlength="60" required placeholder="مثال: مذاكرة قواعد البيانات"/></div><div class="field"><label for="group-course">المساق (اختياري)</label><input id="group-course" class="input" name="course" maxlength="120" list="group-courses"/><datalist id="group-courses">${courseList}</datalist></div><button class="outline-btn" type="submit">إنشاء</button></form></div>`;
  const cards = s.groups
    .map(
      g =>
        `<button class="group-card" data-act="group-open" data-id="${esc(g.id)}"><span class="group-avatar">${esc((g.name || '?').trim().charAt(0))}</span><span class="grow"><strong>${esc(g.name)}</strong><small>${g.course ? esc(g.course) + ' · ' : ''}${g.role === 'owner' ? 'أنت المشرف' : 'عضو'}</small></span>${ic('chevron', 16)}</button>`,
    )
    .join('');
  const head = intro(
    'مجموعات الدراسة',
    `أهلًا ${esc(s.profile.nickname)} — مجموعاتك وزملاؤك`,
    `<button class="outline-btn" data-act="nickname-edit">${ic('note', 15)} تغيير الاسم</button>`,
  );
  // With groups: list first, forms below. Without: forms first, then an empty state.
  return s.groups.length
    ? `${head}<div class="card-stack">${cards}</div><h2 class="groups-title">انضمام أو مجموعة جديدة</h2>${forms}`
    : `${head}${forms}<h2 class="groups-title">مجموعاتي</h2>${noData('لا مجموعات بعد', 'أنشئ مجموعة وشارك رمزها مع زملائك، أو انضم برمز وصلك', 'users')}`;
}

function chatView(ctx) {
  const { ic, esc } = ctx;
  const g = s.active;
  return `<div class="chat-shell"><div class="chat-head"><button class="icon-button" data-act="group-back" aria-label="رجوع">${ic('arrow')}</button><div class="grow"><h2>${esc(g.name)}</h2><p class="muted tiny">${s.memberCount} عضو${g.course ? ` · ${esc(g.course)}` : ''}</p></div><button class="outline-btn" data-act="group-invite">${ic('share', 15)} دعوة</button><button class="icon-button" data-act="group-leave" aria-label="${g.role === 'owner' ? 'حذف المجموعة' : 'مغادرة المجموعة'}" title="${g.role === 'owner' ? 'حذف المجموعة' : 'مغادرة المجموعة'}">${ic('trash')}</button></div><div class="chat-list" id="chat-list" aria-live="polite">${s.hasOlder ? `<button class="subtle-btn chat-older" data-act="chat-older">رسائل أقدم</button>` : ''}${s.messages.length ? s.messages.map(m => messageHTML(ctx, m)).join('') : '<p class="muted tiny chat-empty">لا رسائل بعد. ابدأ المحادثة!</p>'}</div><form id="chat-form" class="chat-composer"><textarea class="textarea" name="body" rows="1" maxlength="2000" placeholder="اكتب رسالة…" aria-label="رسالة" required></textarea><button class="primary-btn" type="submit" aria-label="إرسال">${ic('arrow', 18)}</button></form></div>`;
}

function render(ctx) {
  ctxRef = ctx;
  if (s.status === 'idle' && consented()) setTimeout(() => connect(ctx));
  if (s.status === 'idle')
    return consented()
      ? `<div class="initial-loader"><div class="spinner"></div></div>`
      : introView(ctx);
  if (s.status === 'connecting')
    return `${ctx.intro('مجموعات الدراسة', 'جاري الاتصال…')}<div class="initial-loader"><div class="spinner"></div></div>`;
  if (s.status === 'error')
    return `${ctx.intro('مجموعات الدراسة', '')}<div class="notice warn" role="alert"><strong>${ctx.esc(s.error)}</strong></div><button class="primary-btn" data-act="groups-connect" style="margin-top:14px">إعادة المحاولة</button>`;
  if (!s.profile || s.editingNickname) return nicknameView(ctx);
  if (s.active) return chatView(ctx);
  return listView(ctx);
}

export const pages = [
  { id: 'groups', title: 'مجموعات الدراسة', label: 'مجموعات الدراسة', icon: 'users', render },
];

export function start(ctx) {
  ctxRef = ctx;
  const params = readLaunchParams(location.href);
  if (params.join || params.group) {
    s.prefillCode = params.join || '';
    s.openGroupId = params.group;
    history.replaceState(null, '', location.pathname);
    ctx.go('groups');
  }
}

/** Shared with the push feature: the signed-in client, if any. */
export async function cloudSession() {
  if (s.sb && s.user) return { sb: s.sb, user: s.user };
  const session = await ensureSession();
  s.sb = session.sb;
  s.user = session.user;
  return session;
}

export const actions = {
  'groups-connect': (el, ctx) => {
    try {
      localStorage.setItem(CONSENT_KEY, '1');
    } catch {
      /* storage blocked: consent lasts for this visit */
    }
    s.status = 'idle';
    return connect(ctx);
  },
  'nickname-edit': (el, ctx) => {
    s.editingNickname = true;
    ctx.render();
  },
  'group-open': (el, ctx) => openGroup(ctx, el.dataset.id),
  'group-back': (el, ctx) => {
    closeChannel();
    s.active = null;
    ctx.render();
  },
  'group-invite': async (el, ctx) => {
    const g = s.active;
    const link = inviteLink(g.invite_code, location.href);
    const text = `انضم إلى مجموعة الدراسة "${g.name}" على UCAS Academic Bridge\nالرمز: ${formatInviteCode(g.invite_code)}\n${link}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: g.name, text });
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return;
      }
    }
    ctx.modal(
      'دعوة الزملاء',
      `<p class="muted tiny">أرسل الرمز أو الرابط لزملائك. من يملك الرمز يستطيع الانضمام وقراءة الرسائل.</p><div class="invite-code">${ctx.esc(formatInviteCode(g.invite_code))}</div><input class="input" readonly value="${ctx.esc(link)}" aria-label="رابط الدعوة"/><button class="primary-btn" data-act="invite-copy" data-text="${ctx.esc(text)}">${ctx.ic('check')} نسخ الدعوة</button>`,
    );
  },
  'invite-copy': async (el, ctx) => {
    try {
      await navigator.clipboard.writeText(el.dataset.text);
      ctx.toast('تم النسخ');
    } catch {
      ctx.toast('انسخ الرابط يدويًا', true);
    }
  },
  'group-leave': async (el, ctx) => {
    const g = s.active;
    const owner = g.role === 'owner';
    if (
      !confirm(owner ? `حذف مجموعة "${g.name}" وكل رسائلها لجميع الأعضاء؟` : `مغادرة "${g.name}"؟`)
    )
      return;
    try {
      if (owner) await run(s.sb.from('groups').delete().eq('id', g.id));
      else
        await run(
          s.sb.from('group_members').delete().eq('group_id', g.id).eq('user_id', s.user.id),
        );
      closeChannel();
      s.active = null;
      await loadGroups();
      ctx.render();
      ctx.toast(owner ? 'تم حذف المجموعة' : 'غادرت المجموعة');
    } catch (err) {
      ctx.toast(err.message, true);
    }
  },
  'chat-older': async (el, ctx) => {
    const first = s.messages[0];
    if (!first) return;
    const rows = await run(
      s.sb
        .from('messages')
        .select('id, user_id, body, created_at')
        .eq('group_id', s.active.id)
        .lt('created_at', first.created_at)
        .order('created_at', { ascending: false })
        .limit(PAGE),
    );
    await loadNames(s.active.id);
    s.messages = [...rows.reverse(), ...s.messages];
    s.hasOlder = rows.length === PAGE;
    ctx.render();
  },
};

export const forms = {
  'nickname-form': async (form, ctx) => {
    const v = validateNickname(new FormData(form).get('nickname'));
    if (!v.ok) throw new Error(v.error);
    const row = { id: s.user.id, nickname: v.value };
    await run(s.sb.from('profiles').upsert(row));
    s.profile = row;
    s.editingNickname = false;
    s.names[s.user.id] = v.value;
    await loadGroups();
    ctx.render();
    if (s.prefillCode) await joinByCode(ctx, s.prefillCode);
  },
  'group-create-form': async (form, ctx) => {
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    if (name.length < 2) throw new Error('اسم المجموعة قصير');
    const group = await run(
      s.sb.rpc('create_group', {
        p_name: name,
        p_course: String(fd.get('course') || '').trim() || null,
      }),
    );
    await loadGroups();
    await openGroup(ctx, group.id);
    ctx.toast('أُنشئت المجموعة. اضغط «دعوة» لإرسال الرمز لزملائك.');
  },
  'group-join-form': async (form, ctx) => {
    await joinByCode(ctx, new FormData(form).get('code'));
  },
  'chat-form': async (form, ctx) => {
    const area = form.querySelector('textarea');
    const v = validateMessage(area.value);
    if (!v.ok) {
      if (v.error) throw new Error(v.error);
      return;
    }
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const [msg] = await run(
        s.sb
          .from('messages')
          .insert({ group_id: s.active.id, body: v.value })
          .select('id, user_id, group_id, body, created_at'),
      );
      area.value = '';
      await onIncoming(msg);
    } finally {
      button.disabled = false;
      area.focus();
    }
  },
};

// Enter sends, Shift+Enter makes a new line (desktop keyboards).
document.addEventListener('keydown', e => {
  if (
    e.key === 'Enter' &&
    !e.shiftKey &&
    e.target.matches?.('#chat-form textarea') &&
    !matchMedia('(pointer: coarse)').matches
  ) {
    e.preventDefault();
    e.target.form.requestSubmit();
  }
});

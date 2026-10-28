// Web Push sender for UCAS Academic Bridge.
//
// Called only by the database (pg_cron every minute, and a trigger on new chat messages),
// authenticated with a random secret that lives in the database (private.push_config) —
// it never appears in code or in the browser. VAPID keys are generated on first call and
// stored in the same place; the browser only ever receives the public key.
//
// Request body: { type: 'init' } | { type: 'reminders' } | { type: 'message', id: number }
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.49.1';

const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: { persistSession: false },
  },
);
const SUBJECT = 'https://mmashharawi2021-cell.github.io/UCAS/';

type Config = { secret: string; vapid_public: string | null; vapid_private: string | null };
type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function config(): Promise<Config> {
  const { data, error } = await admin.rpc('push_config');
  if (error || !data?.length) throw new Error('push config unavailable');
  return data[0];
}

async function ensureKeys(cfg: Config) {
  if (cfg.vapid_public && cfg.vapid_private) return cfg;
  const keys = webpush.generateVAPIDKeys();
  const { error } = await admin.rpc('push_store_vapid', {
    p_public: keys.publicKey,
    p_private: keys.privateKey,
  });
  if (error) throw error;
  return { ...cfg, vapid_public: keys.publicKey, vapid_private: keys.privateKey };
}

/** Send one payload to a list of subscriptions; drop the ones the push service says are gone. */
async function sendAll(subs: Sub[], payload: Record<string, unknown>) {
  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async s => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload),
          { TTL: 6 * 3600, urgency: 'high' },
        );
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) gone.push(s.id);
        else console.error('push failed', code, (err as Error).message);
      }
    }),
  );
  if (gone.length) await admin.from('push_subscriptions').delete().in('id', gone);
  return sent;
}

async function subscriptionsFor(userIds: string[], messagesOnly = false) {
  if (!userIds.length) return [] as (Sub & { user_id: string })[];
  let q = admin
    .from('push_subscriptions')
    .select('id, user_id, endpoint, p256dh, auth')
    .in('user_id', userIds);
  if (messagesOnly) q = q.eq('notify_messages', true);
  const { data, error } = await q;
  if (error) throw error;
  return data as (Sub & { user_id: string })[];
}

async function dueReminders() {
  const now = new Date();
  const { data, error } = await admin
    .from('scheduled_reminders')
    .select('id, user_id, title, body, local_key')
    .is('sent_at', null)
    .lte('fire_at', now.toISOString())
    .gte('fire_at', new Date(now.getTime() - 2 * 3600_000).toISOString())
    .limit(500);
  if (error) throw error;
  if (!data.length) return { reminders: 0, sent: 0 };
  // Claim them first so an overlapping run cannot send twice.
  await admin
    .from('scheduled_reminders')
    .update({ sent_at: now.toISOString() })
    .in(
      'id',
      data.map(r => r.id),
    );
  const subs = await subscriptionsFor([...new Set(data.map(r => r.user_id))]);
  let sent = 0;
  for (const r of data) {
    sent += await sendAll(
      subs.filter(s => s.user_id === r.user_id),
      { title: r.title, body: r.body || '', tag: r.local_key, url: './' },
    );
  }
  // Housekeeping: forget old sent reminders.
  await admin
    .from('scheduled_reminders')
    .delete()
    .lt('fire_at', new Date(now.getTime() - 7 * 86400_000).toISOString());
  return { reminders: data.length, sent };
}

async function newMessage(id: number) {
  const { data: msg, error } = await admin
    .from('messages')
    .select('id, group_id, user_id, body, groups(name)')
    .eq('id', id)
    .single();
  if (error || !msg) return { sent: 0 };
  const [{ data: members }, { data: sender }] = await Promise.all([
    admin.from('group_members').select('user_id').eq('group_id', msg.group_id),
    admin.from('profiles').select('nickname').eq('id', msg.user_id).single(),
  ]);
  const others = (members || []).map(m => m.user_id).filter(u => u !== msg.user_id);
  const subs = await subscriptionsFor(others, true);
  const group = (msg.groups as { name?: string } | null)?.name || 'مجموعة دراسة';
  const sent = await sendAll(subs, {
    title: `${sender?.nickname || 'زميل'} · ${group}`,
    body: msg.body.length > 140 ? msg.body.slice(0, 137) + '…' : msg.body,
    tag: `group-${msg.group_id}`,
    url: `./?group=${msg.group_id}`,
  });
  return { sent };
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  let cfg: Config;
  try {
    cfg = await config();
  } catch {
    return json({ error: 'not configured' }, 503);
  }
  if (!safeEqual(req.headers.get('x-push-secret') || '', cfg.secret))
    return json({ error: 'forbidden' }, 403);

  try {
    const body = await req.json().catch(() => ({}));
    cfg = await ensureKeys(cfg);
    webpush.setVapidDetails(SUBJECT, cfg.vapid_public!, cfg.vapid_private!);
    if (body.type === 'init') return json({ ok: true, publicKey: cfg.vapid_public });
    if (body.type === 'reminders') return json({ ok: true, ...(await dueReminders()) });
    if (body.type === 'message' && Number.isInteger(body.id))
      return json({ ok: true, ...(await newMessage(body.id)) });
    if (body.type === 'selftest') {
      // Encrypt + sign a message for a throwaway subscription to prove the crypto path works.
      const ecdh = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
        'deriveBits',
      ]);
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', ecdh.publicKey));
      const b64 = (u: Uint8Array) =>
        btoa(String.fromCharCode(...u))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=+$/, '');
      const details = await webpush.generateRequestDetails(
        {
          endpoint: 'https://fcm.googleapis.com/fcm/send/selftest',
          keys: { p256dh: b64(raw), auth: b64(crypto.getRandomValues(new Uint8Array(16))) },
        },
        JSON.stringify({ title: 'test' }),
      );
      return json({
        ok: true,
        encrypted: details.body.length > 0,
        hasVapid: !!details.headers.Authorization,
      });
    }
    return json({ error: 'unknown type' }, 400);
  } catch (err) {
    console.error(err);
    return json({ error: 'failed' }, 500);
  }
});

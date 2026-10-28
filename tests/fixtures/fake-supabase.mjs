// In-memory stand-in for @supabase/supabase-js used by tests/groups-browser.mjs.
// Implements only the calls the app makes, with the same { data, error } shapes.
const db = (globalThis.__fakeDB ??= {
  profiles: [],
  groups: [],
  group_members: [],
  messages: [],
  push_subscriptions: [],
  scheduled_reminders: [],
});
const ME = '11111111-1111-4111-8111-111111111111';
let signedIn = !!localStorage.getItem('ucas-cloud-auth');
// Email account (sync/AI). Set by the magic-link landing (#access_token=…&email=…).
const EMAIL_KEY = 'fake-email-user';
function currentUser() {
  const email = localStorage.getItem(EMAIL_KEY);
  if (email) return { id: 'email-' + email, email, is_anonymous: false };
  return signedIn ? { id: ME, is_anonymous: true } : null;
}
{
  const m = /access_token=[^&]+.*email=([^&]+)/.exec(location.hash);
  if (m) localStorage.setItem(EMAIL_KEY, decodeURIComponent(m[1]));
}
const channels = new Set();
let seq = 1;

const ok = data => ({ data, error: null });
const fail = message => ({ data: null, error: { message } });

function pick(row, cols) {
  if (!cols || cols === '*') return { ...row };
  const out = {};
  for (const part of cols.split(/,(?![^(]*\))/).map(c => c.trim())) {
    const join = /^(\w+)\(([^)]*)\)$/.exec(part);
    if (join) {
      const target = db[join[1]].find(g => g.id === row.group_id);
      out[join[1]] = target ? pick(target, join[2]) : null;
    } else out[part] = row[part];
  }
  return out;
}

class Query {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.mode = 'select';
  }
  select(cols = '*') {
    this.cols = cols;
    if (this.mode !== 'insert' && this.mode !== 'upsert') this.mode = 'select';
    return this;
  }
  eq(k, v) {
    this.filters.push(r => r[k] === v);
    return this;
  }
  in(k, vs) {
    this.filters.push(r => vs.includes(r[k]));
    return this;
  }
  lt(k, v) {
    this.filters.push(r => r[k] < v);
    return this;
  }
  gt(k, v) {
    if (k === 'updated_at') this.remoteGt = v;
    this.filters.push(r => r[k] > v);
    return this;
  }
  is(k, v) {
    this.filters.push(r => (r[k] ?? null) === v);
    return this;
  }
  order(k, { ascending = true } = {}) {
    this.sort = (a, b) => (a[k] < b[k] ? -1 : a[k] > b[k] ? 1 : 0) * (ascending ? 1 : -1);
    return this;
  }
  limit(n) {
    this.max = n;
    return this;
  }
  insert(rows) {
    this.mode = 'insert';
    this.rows = [].concat(rows);
    return this;
  }
  upsert(rows, opts = {}) {
    this.mode = 'upsert';
    this.rows = [].concat(rows);
    this.conflict = (opts.onConflict || 'id').split(',');
    return this;
  }
  delete() {
    this.mode = 'delete';
    return this;
  }
  visible(row) {
    const t = this.table;
    const member = gid => db.group_members.some(m => m.group_id === gid && m.user_id === ME);
    if (t === 'messages') return member(row.group_id);
    if (t === 'group_members') return member(row.group_id);
    if (t === 'groups') return member(row.id);
    return true;
  }
  run() {
    const table = db[this.table];
    if (this.mode === 'insert') {
      const created = this.rows.map(r => {
        const row = { id: seq++, user_id: ME, created_at: new Date().toISOString(), ...r };
        if (
          this.table === 'messages' &&
          !db.group_members.some(m => m.group_id === r.group_id && m.user_id === ME)
        )
          throw new Error('new row violates row-level security policy');
        table.push(row);
        if (this.table === 'messages') for (const c of channels) c.emit(row);
        return row;
      });
      return ok(this.cols ? created.map(r => pick(r, this.cols)) : null);
    }
    if (this.mode === 'upsert') {
      for (const r of this.rows) {
        const i = table.findIndex(x => this.conflict.every(k => x[k] === r[k]));
        if (i >= 0) table[i] = { ...table[i], ...r };
        else table.push({ id: `row-${seq++}`, ...r });
      }
      return ok(null);
    }
    let rows = table.filter(r => this.visible(r) && this.filters.every(f => f(r)));
    if (this.mode === 'delete') {
      db[this.table] = table.filter(r => !rows.includes(r));
      if (this.table === 'groups')
        for (const g of rows) db.group_members = db.group_members.filter(m => m.group_id !== g.id);
      return ok(null);
    }
    if (this.sort) rows = rows.slice().sort(this.sort);
    if (this.max) rows = rows.slice(0, this.max);
    return ok(rows.map(r => pick(r, this.cols)));
  }
  then(resolve, reject) {
    // sync_records lives on the shared test server (exposed by the test), others in memory.
    const exec =
      this.table === 'sync_records' && globalThis.__fakeRemote
        ? () => globalThis.__fakeRemote('sync', this.remoteQuery())
        : () => this.run();
    return Promise.resolve()
      .then(exec)
      .then(resolve, err => resolve(fail(err.message)))
      .catch(reject);
  }
  remoteQuery() {
    return {
      mode: this.mode,
      rows: this.rows,
      gt: this.remoteGt,
      limit: this.max,
      user: currentUser()?.id,
    };
  }
}

const client = {
  auth: {
    async getSession() {
      const user = currentUser();
      return ok({ session: user ? { user } : null });
    },
    async signInWithOtp({ email, options }) {
      globalThis.__fakeLastLink = `${options.emailRedirectTo}#access_token=fake&type=magiclink&email=${encodeURIComponent(email)}`;
      return ok({});
    },
    async updateUser({ email }, options = {}) {
      globalThis.__fakeLastLink = `${options.emailRedirectTo}#access_token=fake&type=email_change&email=${encodeURIComponent(email)}`;
      return ok({ user: currentUser() });
    },
    async signOut() {
      localStorage.removeItem(EMAIL_KEY);
      localStorage.removeItem('ucas-cloud-auth');
      signedIn = false;
      return ok({});
    },
    async signInAnonymously() {
      if (globalThis.__fakeAnonDisabled)
        return {
          data: null,
          error: {
            code: 'anonymous_provider_disabled',
            message: 'Anonymous sign-ins are disabled',
          },
        };
      signedIn = true;
      localStorage.setItem('ucas-cloud-auth', '{"fake":true}');
      return ok({ user: { id: ME }, session: { user: { id: ME } } });
    },
  },
  from: table => new Query(table),
  storage: {
    from: () => ({
      async upload(path, blob) {
        const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
        await globalThis.__fakeRemote('upload', { path, bytes, type: blob.type });
        return ok({ path });
      },
      async download(path) {
        const file = await globalThis.__fakeRemote('download', { path });
        if (!file) return fail('not found');
        return ok(new Blob([new Uint8Array(file.bytes)], { type: file.type }));
      },
      async remove(paths) {
        await globalThis.__fakeRemote('remove', { paths });
        return ok([]);
      },
    }),
  },
  functions: {
    async invoke(name, { body }) {
      const res = await globalThis.__fakeRemote('invoke', { name, body, user: currentUser() });
      if (res.error)
        return { data: null, error: { context: { json: async () => ({ error: res.error }) } } };
      return ok(res);
    },
  },
  async rpc(name, args) {
    if (name === 'create_group') {
      if (!db.profiles.some(p => p.id === ME)) return fail('set a nickname first');
      const g = {
        id: crypto.randomUUID(),
        name: args.p_name,
        course: args.p_course,
        invite_code: 'TESTGRP' + (db.groups.length + 2),
        created_by: ME,
        created_at: new Date().toISOString(),
      };
      db.groups.push(g);
      db.group_members.push({ group_id: g.id, user_id: ME, role: 'owner' });
      return ok(g);
    }
    if (name === 'join_group') {
      const g = db.groups.find(x => x.invite_code === args.p_code);
      if (!g) return fail('invalid invite code');
      if (!db.group_members.some(m => m.group_id === g.id && m.user_id === ME))
        db.group_members.push({ group_id: g.id, user_id: ME, role: 'member' });
      return ok(g);
    }
    if (name === 'get_vapid_public_key')
      return ok(
        'BJtii5gJYXjSV-q5HJqw0LBh7CK2ntHyS7Pq1SNuAxB3VlXUvsSLvnrrMBYYuCmPum7ivTmkCLcAYZIAcoushmQ',
      );
    return fail('unknown rpc');
  },
  channel(name) {
    const ch = {
      name,
      handlers: [],
      on(_type, filter, cb) {
        this.filter = filter.filter;
        this.handlers.push(cb);
        return this;
      },
      subscribe() {
        channels.add(this);
        return this;
      },
      emit(row) {
        if (this.filter === `group_id=eq.${row.group_id}`)
          for (const h of this.handlers) h({ new: row });
      },
    };
    return ch;
  },
  removeChannel(ch) {
    channels.delete(ch);
  },
};

// Lets the test inject a message "from another student".
globalThis.__fakeIncoming = (groupId, userId, body) => {
  const row = {
    id: seq++,
    group_id: groupId,
    user_id: userId,
    body,
    created_at: new Date().toISOString(),
  };
  db.messages.push(row);
  for (const c of channels) c.emit(row);
};

export function createClient() {
  return client;
}

// Lazy Supabase client. Nothing is downloaded or contacted until a student opens an
// online feature and agrees to it.
import { SUPABASE_URL, SUPABASE_KEY, SUPABASE_JS } from './config.js?v=1.1.0';
import { friendlyError } from '../lib/cloud.js?v=1.1.0';

const STORAGE_KEY = 'ucas-cloud-auth';
let clientPromise = null;

export class CloudError extends Error {
  constructor(cause) {
    super(friendlyError(cause));
    this.cause = cause;
  }
}

export function hasStoredSession() {
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

export function getClient() {
  clientPromise ??= import(/* @vite-ignore */ SUPABASE_JS)
    .then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, storageKey: STORAGE_KEY },
        realtime: { params: { eventsPerSecond: 5 } },
      }),
    )
    .catch(err => {
      clientPromise = null;
      throw new CloudError(err);
    });
  return clientPromise;
}

/** Existing session, or a new anonymous account (nickname-only sign-in). */
export async function ensureSession() {
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  if (data.session) return { sb, user: data.session.user };
  const { data: created, error } = await sb.auth.signInAnonymously();
  if (error) throw new CloudError(error);
  return { sb, user: created.user };
}

/** Run a Supabase call and turn `{ error }` into a friendly thrown error. */
export async function run(promise) {
  const { data, error } = await promise;
  if (error) throw new CloudError(error);
  return data;
}

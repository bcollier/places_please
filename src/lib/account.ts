import type { AuthError, SupabaseClient, User } from '@supabase/supabase-js';

import { exportGuestData, type GuestSnapshot } from '@/lib/api';
import { startGuestMerge } from '@/lib/guest-merge';
import { AppError } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase';

/**
 * Accounts follow the Ignatius app's model, with Supabase email sign-in only:
 *  - Everyone starts as a silent guest (anonymous Supabase user). No sign-in wall.
 *  - "Save your scripts" signs in with an emailed code (a new or existing account, including one
 *    shared with Ignatius at Home) and copies this phone's guest scripts and history into it.
 */

export type AccountResult = { kind: 'switched'; mergedScripts: number } | { kind: 'cancelled' };

export type AccountInfo = { isGuest: boolean; email: string | null };

export function accountInfo(user: User | null): AccountInfo {
  if (!user) return { isGuest: true, email: null };
  return { isGuest: !user.email, email: user.email ?? null };
}

function friendlyAuthError(error: AuthError | Error): AppError {
  const msg = error.message || '';
  const code = (error as AuthError).code;
  if (code === 'otp_expired' || /expired|invalid.*(otp|token)/i.test(msg)) {
    return new AppError('That code is wrong or has expired. Check the latest email and try again.', 'bad_code', false);
  }
  if (code === 'over_email_send_rate_limit' || /rate limit/i.test(msg)) {
    return new AppError('Too many emails sent. Wait a minute and try again.', 'rate_limited', false);
  }
  if (code === 'email_address_invalid' || /invalid.*email/i.test(msg)) {
    return new AppError('That email address doesn’t look right.', 'bad_email', false);
  }
  if (code === 'otp_disabled' || code === 'signup_disabled' || /signups not allowed/i.test(msg)) {
    return new AppError('Email sign-in is turned off in Supabase (Authentication › Providers › Email).', 'email_disabled', false);
  }
  return new AppError("Couldn't sign in. Check your connection and try again.", code ?? 'auth_error');
}

async function snapshotGuestData(): Promise<GuestSnapshot> {
  try {
    return await exportGuestData();
  } catch (err) {
    console.warn('[account] could not snapshot guest data', err);
    throw new AppError("Couldn't read this phone's scripts to bring them along. Check your connection and try again.");
  }
}

/** The current session's access token, if it belongs to an anonymous guest. */
async function currentGuestToken(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.is_anonymous ? data.session.access_token : null;
}

async function signedInUserId(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user.id;
  if (!userId) throw new AppError("Couldn't finish signing in. Please try again.");
  return userId;
}

async function mergeGuestData(userId: string, snapshot: GuestSnapshot): Promise<number> {
  try {
    // Saved on the device first, so a failed copy resumes automatically (src/lib/guest-merge.ts).
    return await startGuestMerge(userId, snapshot);
  } catch (err) {
    console.warn('[account] merge did not finish', err);
    throw new AppError(
      "You're signed in. This phone's scripts are still being copied to your account; the app will finish automatically the next time it connects.",
      'merge_pending',
      false,
    );
  }
}

/** Best effort and not awaited. Uses the guest's own token, since the session now belongs to the account. */
function deleteGuestLeftovers(supabase: SupabaseClient, guestToken: string) {
  void supabase.functions
    .invoke('places-ai', { body: { action: 'delete_account' }, headers: { Authorization: `Bearer ${guestToken}` } })
    .catch(() => {});
}

/**
 * Signs in with a code and brings this phone's guest scripts and history along.
 * Afterwards the old guest's copy is deleted (best effort), using the guest's own token.
 */
async function switchAccount(signIn: () => Promise<void>): Promise<AccountResult> {
  const supabase = getSupabase();
  const snapshot = await snapshotGuestData();
  const guestToken = await currentGuestToken(supabase);

  await signIn();

  const newUserId = await signedInUserId(supabase);
  const mergedScripts = await mergeGuestData(newUserId, snapshot);
  // The guest's data now lives in the account; remove the leftover guest copy and login.
  if (guestToken) deleteGuestLeftovers(supabase, guestToken);
  return { kind: 'switched', mergedScripts };
}

/**
 * Sends a sign-in code. This uses Supabase's "Magic link or OTP" / "Confirm sign up" emails, which in
 * the shared project already include the code (the "Change email address" one is link-only and
 * belongs to Ignatius at Home, so we don't use it).
 */
export async function startEmail(email: string): Promise<string> {
  const address = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new AppError('That email address doesn’t look right.', 'bad_email', false);
  }
  const { error } = await getSupabase().auth.signInWithOtp({ email: address, options: { shouldCreateUser: true } });
  if (error) throw friendlyAuthError(error);
  return address;
}

export async function verifyEmailCode(email: string, code: string): Promise<AccountResult> {
  const supabase = getSupabase();
  const token = code.replace(/\s+/g, '');
  if (!/^\d{6,10}$/.test(token)) throw new AppError('Enter the code from the email.', 'bad_code', false);
  return switchAccount(async () => {
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw friendlyAuthError(error);
  });
}

/** Signs out; the app immediately starts a fresh guest session. */
export async function signOut() {
  const { error } = await getSupabase().auth.signOut({ scope: 'local' });
  if (error) throw friendlyAuthError(error);
}

/**
 * Permanently deletes this app's data (scripts, history, settings) and signs out.
 * The email login itself is kept because it's shared with other apps in the same Supabase project.
 */
export async function deleteAccount() {
  const supabase = getSupabase();
  const { error } = await supabase.functions.invoke('places-ai', { body: { action: 'delete_account' } });
  if (error) throw new AppError("Couldn't delete your data. Check your connection and try again.");
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
}

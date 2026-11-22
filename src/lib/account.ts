import type { AuthError, User } from '@supabase/supabase-js';

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

/**
 * Signs in with a code and brings this phone's guest scripts and history along.
 * Afterwards the old guest's copy is deleted (best effort), using the guest's own token.
 */
async function switchAccount(signIn: () => Promise<void>): Promise<AccountResult> {
  const supabase = getSupabase();
  let snapshot: GuestSnapshot;
  try {
    snapshot = await exportGuestData();
  } catch (err) {
    console.warn('[account] could not snapshot guest data', err);
    throw new AppError("Couldn't read this phone's scripts to bring them along. Check your connection and try again.");
  }
  const { data: before } = await supabase.auth.getSession();
  const guestToken = before.session?.user.is_anonymous ? before.session.access_token : null;

  await signIn();

  const { data: after } = await supabase.auth.getSession();
  const newUserId = after.session?.user.id;
  if (!newUserId) throw new AppError("Couldn't finish signing in. Please try again.");

  let mergedScripts = 0;
  try {
    // Saved on the device first, so a failed copy resumes automatically (src/lib/guest-merge.ts).
    mergedScripts = await startGuestMerge(newUserId, snapshot);
  } catch (err) {
    console.warn('[account] merge did not finish', err);
    throw new AppError(
      "You're signed in. This phone's scripts are still being copied to your account; the app will finish automatically the next time it connects.",
      'merge_pending',
      false,
    );
  }
  if (guestToken) {
    // The guest's data now lives in the account; remove the leftover guest copy and login.
    void supabase.functions
      .invoke('places-ai', { body: { action: 'delete_account' }, headers: { Authorization: `Bearer ${guestToken}` } })
      .catch(() => {});
  }
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

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { accountInfo, type AccountInfo } from '@/lib/account';
import { toUserMessage, withRetry } from '@/lib/errors';
import { getSupabase } from '@/lib/supabase';

/**
 * Everyone starts as a silent guest (anonymous sign-in, no login screen); the session lives in the
 * Keychain. Guests can later save their account with an email code (see src/lib/account.ts),
 * which keeps the same user id. If the session ends (sign out, account deleted),
 * a fresh guest session starts automatically.
 */

type AuthState =
  | { status: 'loading'; userId: null; user: null; error: null }
  | { status: 'ready'; userId: string; user: User; error: null }
  | { status: 'error'; userId: null; user: null; error: string };

type AuthContextValue = AuthState & { retry: () => void; account: AccountInfo };

const AuthContext = createContext<AuthContextValue | null>(null);

const LOADING: AuthState = { status: 'loading', userId: null, user: null, error: null };

function readyState(user: User): AuthState {
  return { status: 'ready', userId: user.id, user, error: null };
}

function errorState(err: unknown): AuthState {
  const fatal = (err as { fatal?: boolean })?.fatal;
  return {
    status: 'error',
    userId: null,
    user: null,
    error: fatal ? (err as Error).message : toUserMessage(err, "Couldn't connect. Check your internet connection."),
  };
}

/** The saved session's user, or a new guest (anonymous) user when there is no session. */
async function currentOrGuestUser(supabase: SupabaseClient): Promise<User> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (sessionData.session?.user) return sessionData.session.user;
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.user) {
    if (error && /anonymous/i.test(error.message)) {
      // Not retryable: a project setting.
      throw Object.assign(
        new Error('Anonymous sign-ins are disabled in Supabase. Enable them under Authentication › Providers.'),
        { fatal: true },
      );
    }
    throw error ?? new Error('Sign-in failed');
  }
  return data.user;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(LOADING);
  // Only the latest sign-in attempt may set the state; older ones finishing late are ignored.
  const attempt = useRef(0);

  const signIn = useCallback(async () => {
    const thisAttempt = ++attempt.current;
    try {
      const supabase = getSupabase();
      const user = await withRetry(() => currentOrGuestUser(supabase));
      if (thisAttempt === attempt.current) setState(readyState(user));
    } catch (err) {
      console.warn('[auth] sign-in failed', err);
      if (thisAttempt === attempt.current) setState(errorState(err));
    }
  }, []);

  useEffect(() => {
    // State is only set after the network request resolves, never synchronously here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void signIn();
    const { data } = getSupabase().auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session)) {
        // Signed out, deleted, or the session was lost: start a fresh guest session.
        setState(LOADING);
        void signIn();
        return;
      }
      if (session?.user) {
        // Covers signing in to another account and linking a login (USER_UPDATED).
        attempt.current++;
        setState(readyState(session.user));
      }
    });
    return () => data.subscription.unsubscribe();
  }, [signIn]);

  const retry = useCallback(() => {
    setState(LOADING);
    void signIn();
  }, [signIn]);

  return (
    <AuthContext.Provider value={{ ...state, retry, account: accountInfo(state.user) }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react';

import * as api from '@/lib/api';
import { toUserMessage } from '@/lib/errors';
import { resumeGuestMerge } from '@/lib/guest-merge';
import { loadLocalSnapshot, saveLocalSnapshot } from '@/lib/local-store';
import { DEFAULT_SETTINGS, type Script, type Settings } from '@/lib/types';

type Setter<T> = Dispatch<SetStateAction<T>>;

export type UserDataState = {
  scripts: Script[];
  settings: Settings;
  currentScriptId: string | null;
};

export type UserDataSetters = {
  setLoading: Setter<boolean>;
  setError: Setter<string | null>;
  setScripts: Setter<Script[]>;
  setSettings: Setter<Settings>;
  setCurrentScriptId: Setter<string | null>;
};

/**
 * Loads the signed-in user's scripts and settings: the on-device copy (AsyncStorage) right away,
 * then Supabase. Keeps the on-device copy up to date afterwards. Returns `refresh`, which reloads
 * from Supabase.
 */
export function useUserDataSync(userId: string | null, data: UserDataState, setters: UserDataSetters) {
  /** The user whose on-device copy has been loaded; nothing is written back before that. */
  const [hydratedUser, setHydratedUser] = useState<string | null>(null);
  const userRef = useCurrentUserRef(userId);
  const refresh = useServerRefresh(userRef, setters);
  useLaunchLoad(userId, userRef, refresh, setters, setHydratedUser);
  useLocalCopySaver(userId, hydratedUser, data);
  return refresh;
}

/**
 * The signed-in user right now. Requests started for an earlier user are ignored when they return,
 * so a slow response from a previous account can never overwrite (or be saved as) the new one.
 */
function useCurrentUserRef(userId: string | null) {
  const userRef = useRef(userId);
  useEffect(() => {
    userRef.current = userId;
  }, [userId]);
  return userRef;
}

/** Reloads scripts and settings from Supabase. Only the newest request for the current user is applied. */
function useServerRefresh(userRef: RefObject<string | null>, setters: UserDataSetters) {
  const { setLoading, setError, setScripts, setSettings, setCurrentScriptId } = setters;
  const requestGeneration = useRef(0);

  return useCallback(async () => {
    const forUser = userRef.current;
    if (!forUser) return;
    const generation = ++requestGeneration.current;
    const isStale = () => generation !== requestGeneration.current || userRef.current !== forUser;
    try {
      const [list, profile] = await Promise.all([api.listScripts(), api.getProfile(forUser)]);
      if (isStale()) return;
      setError(null);
      setScripts(list);
      setSettings(profile.settings);
      setCurrentScriptId(profile.current_script_id);
    } catch (err) {
      if (!isStale()) setError(toUserMessage(err));
    } finally {
      if (!isStale()) setLoading(false);
    }
  }, [userRef, setError, setScripts, setSettings, setCurrentScriptId, setLoading]);
}

/** Launch: show the on-device copy right away, then refresh from Supabase. */
function useLaunchLoad(
  userId: string | null,
  userRef: RefObject<string | null>,
  refresh: () => Promise<void>,
  setters: UserDataSetters,
  setHydratedUser: Setter<string | null>,
) {
  const { setLoading, setScripts, setSettings, setCurrentScriptId } = setters;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const local = await loadLocalSnapshot(userId);
      if (cancelled || userRef.current !== userId) return;
      setScripts(local?.scripts ?? []);
      setSettings(local?.settings ?? DEFAULT_SETTINGS);
      setCurrentScriptId(local?.currentScriptId ?? null);
      if (local) setLoading(false);
      setHydratedUser(userId);
      await refresh();
      // Finish copying a guest's scripts into this account if an earlier attempt was interrupted.
      const resumed = await resumeGuestMerge(userId);
      if (resumed !== null && !cancelled) await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, userRef, refresh, setScripts, setSettings, setCurrentScriptId, setLoading, setHydratedUser]);
}

/** Keep the on-device copy up to date with every change (once it has been loaded for this user). */
function useLocalCopySaver(userId: string | null, hydratedUser: string | null, data: UserDataState) {
  const { scripts, settings, currentScriptId } = data;
  useEffect(() => {
    if (!userId || hydratedUser !== userId) return;
    void saveLocalSnapshot(userId, { scripts, settings, currentScriptId });
  }, [userId, hydratedUser, scripts, settings, currentScriptId]);
}

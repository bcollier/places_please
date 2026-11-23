import { useCallback } from 'react';

import type { UserDataSetters } from '@/hooks/use-user-data-sync';
import * as api from '@/lib/api';
import type { Script, Settings } from '@/lib/types';

export type ScriptActions = {
  addScript: (input: Parameters<typeof api.createScript>[0]) => Promise<Script>;
  saveScript: (id: string, patch: Parameters<typeof api.updateScript>[1]) => Promise<Script>;
  removeScript: (id: string) => Promise<void>;
  setCurrentScript: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  markPracticed: (id: string) => void;
};

type Options = {
  userId: string | null;
  settings: Settings;
  currentScriptId: string | null;
  setters: Pick<UserDataSetters, 'setScripts' | 'setSettings' | 'setCurrentScriptId'>;
};

/** The changes screens can make to the user's scripts and settings, saved to Supabase. */
export function useScriptActions({ userId, settings, currentScriptId, setters }: Options): ScriptActions {
  const { setScripts, setSettings, setCurrentScriptId } = setters;
  const persistCurrent = useCurrentScriptPersister(userId, setCurrentScriptId);

  const addScript = useCallback<ScriptActions['addScript']>(
    async (input) => {
      const created = await api.createScript(input);
      setScripts((prev) => [created, ...prev]);
      persistCurrent(created.id);
      return created;
    },
    [persistCurrent, setScripts],
  );

  const saveScript = useCallback<ScriptActions['saveScript']>(
    async (id, patch) => {
      const updated = await api.updateScript(id, patch);
      setScripts((prev) => prev.map((s) => (s.id === id ? updated : s)));
      return updated;
    },
    [setScripts],
  );

  const removeScript = useCallback(
    async (id: string) => {
      await api.deleteScript(id);
      setScripts((prev) => prev.filter((s) => s.id !== id));
      if (currentScriptId === id) setCurrentScriptId(null);
    },
    [currentScriptId, setScripts, setCurrentScriptId],
  );

  const updateSettings = useSettingsUpdater(userId, settings, setSettings);

  const markPracticed = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      setScripts((prev) => prev.map((s) => (s.id === id ? { ...s, last_practiced_at: now } : s)));
      if (currentScriptId !== id) persistCurrent(id);
    },
    [currentScriptId, persistCurrent, setScripts],
  );

  return { addScript, saveScript, removeScript, setCurrentScript: persistCurrent, updateSettings, markPracticed };
}

/** Sets the current script and saves it to the profile (best effort: a failed save is ignored). */
function useCurrentScriptPersister(userId: string | null, setCurrentScriptId: UserDataSetters['setCurrentScriptId']) {
  return useCallback(
    (id: string | null) => {
      setCurrentScriptId(id);
      if (userId) void api.updateProfile(userId, { current_script_id: id }).catch(() => {});
    },
    [userId, setCurrentScriptId],
  );
}

/** Applies a settings change right away and rolls it back if saving fails. */
function useSettingsUpdater(
  userId: string | null,
  settings: Settings,
  setSettings: UserDataSetters['setSettings'],
): ScriptActions['updateSettings'] {
  return useCallback(
    async (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch };
      setSettings(next);
      if (!userId) return;
      try {
        await api.updateProfile(userId, { settings: next });
      } catch (err) {
        setSettings(settings);
        throw err;
      }
    },
    [settings, userId, setSettings],
  );
}

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import * as api from '@/lib/api';
import { toUserMessage } from '@/lib/errors';
import { loadLocalSnapshot, saveLocalSnapshot } from '@/lib/local-store';
import { DEFAULT_SETTINGS, type Script, type Settings } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

type DataContextValue = {
  loading: boolean;
  error: string | null;
  scripts: Script[];
  settings: Settings;
  currentScriptId: string | null;
  currentScript: Script | null;
  refresh: () => Promise<void>;
  getScript: (id: string) => Script | undefined;
  addScript: (input: Parameters<typeof api.createScript>[0]) => Promise<Script>;
  saveScript: (id: string, patch: Parameters<typeof api.updateScript>[1]) => Promise<Script>;
  removeScript: (id: string) => Promise<void>;
  setCurrentScript: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  markPracticed: (id: string) => void;
};

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [currentScriptId, setCurrentScriptId] = useState<string | null>(null);
  /** The user whose on-device copy has been loaded; nothing is written back before that. */
  const [hydratedUser, setHydratedUser] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const [list, profile] = await Promise.all([api.listScripts(), api.getProfile(userId)]);
      setError(null);
      setScripts(list);
      setSettings(profile.settings);
      setCurrentScriptId(profile.current_script_id);
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // Launch: show the on-device copy (AsyncStorage) right away, then refresh from Supabase.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const local = await loadLocalSnapshot(userId);
      if (cancelled) return;
      setScripts(local?.scripts ?? []);
      setSettings(local?.settings ?? DEFAULT_SETTINGS);
      setCurrentScriptId(local?.currentScriptId ?? null);
      if (local) setLoading(false);
      setHydratedUser(userId);
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, refresh]);

  // Keep the on-device copy up to date with every change.
  useEffect(() => {
    if (!userId || hydratedUser !== userId) return;
    void saveLocalSnapshot(userId, { scripts, settings, currentScriptId });
  }, [userId, hydratedUser, scripts, settings, currentScriptId]);

  const getScript = useCallback((id: string) => scripts.find((s) => s.id === id), [scripts]);

  const persistCurrent = useCallback(
    (id: string | null) => {
      setCurrentScriptId(id);
      if (userId) void api.updateProfile(userId, { current_script_id: id }).catch(() => {});
    },
    [userId],
  );

  const addScript = useCallback<DataContextValue['addScript']>(
    async (input) => {
      const created = await api.createScript(input);
      setScripts((prev) => [created, ...prev]);
      persistCurrent(created.id);
      return created;
    },
    [persistCurrent],
  );

  const saveScript = useCallback<DataContextValue['saveScript']>(async (id, patch) => {
    const updated = await api.updateScript(id, patch);
    setScripts((prev) => prev.map((s) => (s.id === id ? updated : s)));
    return updated;
  }, []);

  const removeScript = useCallback(
    async (id: string) => {
      await api.deleteScript(id);
      setScripts((prev) => prev.filter((s) => s.id !== id));
      if (currentScriptId === id) setCurrentScriptId(null);
    },
    [currentScriptId],
  );

  const updateSettings = useCallback(
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
    [settings, userId],
  );

  const markPracticed = useCallback(
    (id: string) => {
      const now = new Date().toISOString();
      setScripts((prev) => prev.map((s) => (s.id === id ? { ...s, last_practiced_at: now } : s)));
      if (currentScriptId !== id) persistCurrent(id);
    },
    [currentScriptId, persistCurrent],
  );

  const currentScript = useMemo(() => {
    if (scripts.length === 0) return null;
    return (
      scripts.find((s) => s.id === currentScriptId) ??
      [...scripts].sort((a, b) =>
        (b.last_practiced_at ?? b.updated_at).localeCompare(a.last_practiced_at ?? a.updated_at),
      )[0]
    );
  }, [scripts, currentScriptId]);

  const value: DataContextValue = {
    loading,
    error,
    scripts,
    settings,
    currentScriptId,
    currentScript,
    refresh,
    getScript,
    addScript,
    saveScript,
    removeScript,
    setCurrentScript: persistCurrent,
    updateSettings,
    markPracticed,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}

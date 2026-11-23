import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { useScriptActions, type ScriptActions } from '@/hooks/use-script-actions';
import { useUserDataSync } from '@/hooks/use-user-data-sync';
import { DEFAULT_SETTINGS, type Script, type Settings } from '@/lib/types';
import { useAuth } from '@/providers/auth-provider';

type DataContextValue = ScriptActions & {
  loading: boolean;
  error: string | null;
  scripts: Script[];
  settings: Settings;
  currentScriptId: string | null;
  currentScript: Script | null;
  refresh: () => Promise<void>;
  getScript: (id: string) => Script | undefined;
};

const DataContext = createContext<DataContextValue | null>(null);

export function DataProvider({ children }: { children: ReactNode }) {
  const { userId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [currentScriptId, setCurrentScriptId] = useState<string | null>(null);

  const refresh = useUserDataSync(
    userId,
    { scripts, settings, currentScriptId },
    { setLoading, setError, setScripts, setSettings, setCurrentScriptId },
  );
  const actions = useScriptActions({
    userId,
    settings,
    currentScriptId,
    setters: { setScripts, setSettings, setCurrentScriptId },
  });
  const getScript = useCallback((id: string) => scripts.find((s) => s.id === id), [scripts]);
  const currentScript = useMemo(() => pickCurrentScript(scripts, currentScriptId), [scripts, currentScriptId]);

  const value: DataContextValue = {
    loading,
    error,
    scripts,
    settings,
    currentScriptId,
    currentScript,
    refresh,
    getScript,
    ...actions,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/** The chosen script, or else the one practiced (or edited) most recently. */
function pickCurrentScript(scripts: Script[], currentScriptId: string | null): Script | null {
  if (scripts.length === 0) return null;
  return (
    scripts.find((s) => s.id === currentScriptId) ??
    [...scripts].sort((a, b) =>
      (b.last_practiced_at ?? b.updated_at).localeCompare(a.last_practiced_at ?? a.updated_at),
    )[0]
  );
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData must be used inside DataProvider');
  return ctx;
}

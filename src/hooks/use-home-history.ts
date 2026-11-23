import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { listPracticeHistory } from '@/lib/api';
import type { PracticeSession } from '@/lib/types';

/** Recent practice history for the home screen, reloaded on focus and on pull-to-refresh (with the scripts). */
export function useHomeHistory(refreshScripts: () => Promise<void>) {
  const [history, setHistory] = useState<PracticeSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await listPracticeHistory(60));
    } catch {
      // Stats are a nice-to-have; the home screen still works without them.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [loadHistory]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refreshScripts(), loadHistory()]);
    setRefreshing(false);
  }, [refreshScripts, loadHistory]);

  return { history, refreshing, onRefresh };
}

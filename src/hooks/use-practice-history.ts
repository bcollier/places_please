import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { listPracticeHistory } from '@/lib/api';
import { toUserMessage } from '@/lib/errors';
import type { PracticeSession } from '@/lib/types';

const HISTORY_LIMIT = 200;

/** Recent practice sessions, reloaded each time the screen comes into focus and on pull-to-refresh. */
export function usePracticeHistory() {
  const [sessions, setSessions] = useState<PracticeSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSessions(await listPracticeHistory(HISTORY_LIMIT));
    } catch (err) {
      setError(toUserMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return { sessions, error, refreshing, load, refresh };
}

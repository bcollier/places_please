import { useCallback, useRef, useState } from 'react';

import { savePracticeSession, type NewPracticeSession } from '@/lib/api';
import { toUserMessage } from '@/lib/errors';
import { useData } from '@/providers/data-provider';

/**
 * Saves a practice session once per run. A failed save is NOT treated as saved: it can be retried
 * (the summary's "Try saving again", or automatically when leaving the screen), and two saves never
 * run at the same time.
 */
export function useSessionSaver() {
  const { markPracticed } = useData();
  const savedRef = useRef(false);
  const inFlightRef = useRef(false);
  const lastSessionRef = useRef<NewPracticeSession | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useCallback(
    async (session: NewPracticeSession) => {
      lastSessionRef.current = session;
      if (savedRef.current || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        await savePracticeSession(session);
        savedRef.current = true;
        setSaveError(null);
        markPracticed(session.script_id);
      } catch (err) {
        setSaveError(`This session wasn't saved to your history yet. ${toUserMessage(err)}`);
      } finally {
        inFlightRef.current = false;
      }
    },
    [markPracticed],
  );

  /** Retries the last session that failed to save. */
  const retry = useCallback(() => {
    if (lastSessionRef.current) void save(lastSessionRef.current);
  }, [save]);

  const reset = useCallback(() => {
    savedRef.current = false;
    lastSessionRef.current = null;
    setSaveError(null);
  }, []);

  return { save, retry, reset, saveError, isSaved: () => savedRef.current };
}

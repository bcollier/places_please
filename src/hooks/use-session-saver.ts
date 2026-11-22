import { useCallback, useRef, useState } from 'react';

import { savePracticeSession, type NewPracticeSession } from '@/lib/api';
import { toUserMessage } from '@/lib/errors';
import { useData } from '@/providers/data-provider';

/** Saves a practice session exactly once per run, and remembers whether it failed. */
export function useSessionSaver() {
  const { markPracticed } = useData();
  const savedRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = useCallback(
    async (session: NewPracticeSession) => {
      if (savedRef.current) return;
      savedRef.current = true;
      markPracticed(session.script_id);
      try {
        await savePracticeSession(session);
        setSaveError(null);
      } catch (err) {
        setSaveError(`This session wasn't saved to your history. ${toUserMessage(err)}`);
      }
    },
    [markPracticed],
  );

  const reset = useCallback(() => {
    savedRef.current = false;
    setSaveError(null);
  }, []);

  return { save, reset, saveError, isSaved: () => savedRef.current };
}

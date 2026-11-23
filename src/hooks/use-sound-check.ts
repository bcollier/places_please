import { useState } from 'react';

import { runSoundCheck, type CheckStep } from '@/lib/audio/sound-check';
import { stopSpeaking } from '@/lib/audio/tts';

/** Runs the Settings sound check and exposes each step's result as it happens. */
export function useSoundCheck() {
  const [steps, setSteps] = useState<CheckStep[]>([]);
  const [checking, setChecking] = useState(false);

  const run = async () => {
    stopSpeaking();
    setChecking(true);
    setSteps([]);
    try {
      await runSoundCheck(setSteps);
    } finally {
      setChecking(false);
    }
  };

  return { steps, checking, run };
}

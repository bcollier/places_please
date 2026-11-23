import { useEffect, useRef } from 'react';

import { Cancellation } from '@/lib/audio/cancel';
import { castVoices, speak, stopSpeaking } from '@/lib/audio/tts';
import { uniqueCharacters } from '@/lib/script-model';
import type { Gender, ScriptLine } from '@/lib/types';
import { useData } from '@/providers/data-provider';

/** Reads a cue line aloud in its character's voice. Only one cue plays at a time; leaving the screen stops it. */
export function useCueReader(lines: ScriptLine[], me: string, genders: Record<string, Gender>) {
  const { settings } = useData();
  const speechToken = useRef<Cancellation | null>(null);

  useEffect(() => {
    return () => {
      speechToken.current?.cancel();
      stopSpeaking();
    };
  }, []);

  const stopCue = () => {
    speechToken.current?.cancel();
  };

  const readCue = async (cue: ScriptLine) => {
    speechToken.current?.cancel();
    const token = new Cancellation();
    speechToken.current = token;
    try {
      const voices = await castVoices({
        characters: uniqueCharacters(lines),
        me,
        genders,
        engine: settings.voiceEngine,
      });
      await speak(cue.text, voices.forCharacter(cue.character), settings.speechRate, token);
    } catch {
      // cancelled or speech unavailable: nothing to do
    }
  };

  return { readCue, stopCue };
}

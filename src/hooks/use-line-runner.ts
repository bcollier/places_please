import { useAudioRecorder } from 'expo-audio';
import { useEffect, useRef, useState } from 'react';

import { useSessionSaver } from '@/hooks/use-session-saver';
import { SPEECH_RECORDING_OPTIONS } from '@/lib/audio/line-listener';
import { LineRunner, type RunnerState } from '@/lib/rehearsal/line-runner';
import type { LineAttempt, Script, ScriptLine } from '@/lib/types';
import { useData } from '@/providers/data-provider';

/**
 * Owns the Run Lines session for one script and scene: the LineRunner, its live state, and saving
 * the practice session when the scene finishes or the actor leaves partway through.
 */
export function useLineRunner(script: Script, lines: ScriptLine[], scene: string | null) {
  const { settings } = useData();
  const me = script.my_character!;
  const myLineCount = lines.filter((l) => l.character === me).length;

  const recorder = useAudioRecorder(SPEECH_RECORDING_OPTIONS);
  const { save, retry, reset, saveError, isSaved } = useSessionSaver();
  const startedAt = useRef(new Date());

  const [runner] = useState(() => new LineRunner(lines, me, recorder, settings, script.character_genders));
  const [state, setState] = useState<RunnerState>(runner.getState());

  useEffect(() => runner.subscribe(setState), [runner]);
  useEffect(() => runner.updateGenders(script.character_genders), [runner, script.character_genders]);

  const saveAttempts = (attempts: LineAttempt[]) =>
    save({
      script_id: script.id,
      mode: 'run_lines',
      character: me,
      scene,
      started_at: startedAt.current,
      attempts,
      lines_total: myLineCount,
    });

  useEffect(() => {
    if (state.phase !== 'finished') return;
    void saveAttempts(state.attempts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Leaving mid-scene: stop audio and keep whatever was practiced.
  useEffect(() => {
    return () => {
      const s = runner.getState();
      void runner.stop();
      if (!isSaved() && s.attempts.length > 0) void saveAttempts(s.attempts);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runner]);

  /** "Run it again" from the summary: a fresh run with a fresh session to save. */
  const restart = () => {
    reset();
    startedAt.current = new Date();
    runner.restart();
  };

  return { runner, state, myLineCount, restart, saveError, retrySave: retry };
}

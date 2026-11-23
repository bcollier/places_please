import { useEffect, useRef, useState } from 'react';

import { useGenderGuess } from '@/hooks/use-gender-guess';
import { useSessionSaver } from '@/hooks/use-session-saver';
import { ListenPlayer, type ListenState } from '@/lib/rehearsal/listen-player';
import type { Script, ScriptLine } from '@/lib/types';
import { useData } from '@/providers/data-provider';

/**
 * Owns the Listen player for one screen visit: follows its state, keeps its voice casting current, and
 * saves the session to practice history when the scene finishes or the screen closes.
 */
export function useListenPlayer(script: Script, lines: ScriptLine[], scene: string | null) {
  const { settings } = useData();
  const me = script.my_character;
  const startedAt = useRef(new Date());
  const { save } = useSessionSaver();

  const saveSession = (heard: number) => {
    if (heard === 0) return;
    void save({
      script_id: script.id,
      mode: 'listen',
      character: me,
      scene,
      started_at: startedAt.current,
      attempts: [],
      lines_total: heard,
    });
  };

  const [player] = useState(() => new ListenPlayer(lines, me, settings, script.character_genders));
  const [state, setState] = useState<ListenState>(player.getState());

  useEffect(() => player.subscribe(setState), [player]);
  useEffect(() => player.updateGenders(script.character_genders), [player, script.character_genders]);
  useGenderGuess(script);
  useEffect(() => {
    if (state.phase === 'finished') saveSession(player.heardCount());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);
  useEffect(
    () => () => {
      void player.stop();
      saveSession(player.heardCount());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [player],
  );

  return { player, state };
}

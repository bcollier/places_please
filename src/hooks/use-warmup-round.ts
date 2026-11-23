import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';

import { useSessionSaver } from '@/hooks/use-session-saver';
import { playSound, preloadSounds } from '@/lib/audio/sfx';
import { buildWarmupRound, type WarmupQuestion } from '@/lib/rehearsal/warmup';
import type { LineAttempt, ScriptLine } from '@/lib/types';

/**
 * One Warm Up round of flash cards: which card is showing, what was picked, the score so far, and
 * saving the finished round to practice history.
 */
export function useWarmupRound(scriptId: string, lines: ScriptLine[], me: string, scene: string | null) {
  const [questions, setQuestions] = useState<WarmupQuestion[]>(() => buildWarmupRound(lines, me));
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<LineAttempt[]>([]);
  const startedAt = useRef(new Date());
  const { save, retry, reset, saveError } = useSessionSaver();

  useEffect(() => {
    preloadSounds();
  }, []);

  const finished = index >= questions.length;
  const question = questions[index];
  const rightCount = attempts.filter((a) => a.verdict === 'perfect').length;

  useEffect(() => {
    if (finished && attempts.length > 0) {
      void save({
        script_id: scriptId,
        mode: 'warmup',
        character: me,
        scene,
        started_at: startedAt.current,
        attempts,
        lines_total: questions.length,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const choose = (lineId: string) => {
    if (chosen || !question) return;
    setChosen(lineId);
    const correct = lineId === question.answer.id;
    setAttempts((a) => [...a, { lineId: question.answer.id, verdict: correct ? 'perfect' : 'missed', accuracy: correct ? 1 : 0 }]);
    giveAnswerFeedback(correct);
  };

  const next = () => {
    setChosen(null);
    setIndex((i) => i + 1);
  };

  const again = () => {
    reset();
    startedAt.current = new Date();
    setQuestions(buildWarmupRound(lines, me));
    setAttempts([]);
    setChosen(null);
    setIndex(0);
  };

  return { questions, index, question, chosen, attempts, rightCount, finished, choose, next, again, saveError, retrySave: retry };
}

function giveAnswerFeedback(correct: boolean) {
  void Haptics.notificationAsync(correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
  void playSound(correct ? 'perfect' : 'miss');
}

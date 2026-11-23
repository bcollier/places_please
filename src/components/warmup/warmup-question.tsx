import { StyleSheet, View } from 'react-native';

import { AnswerChoice } from '@/components/warmup/answer-choice';
import { CueCard } from '@/components/warmup/cue-card';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import type { WarmupQuestion as Question } from '@/lib/rehearsal/warmup';

/** One flash card: progress, the cue, the answer choices, and Next once an answer is picked. */
export function WarmupQuestion({
  question,
  index,
  total,
  rightCount,
  chosenId,
  onChoose,
  onReadCue,
  onNext,
}: {
  question: Question;
  index: number;
  total: number;
  rightCount: number;
  chosenId: string | null;
  onChoose: (lineId: string) => void;
  onReadCue: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <View style={styles.progressRow}>
        <Text variant="overline">
          Card {index + 1} of {total}
        </Text>
        <Text variant="overline" color="perfect">
          {rightCount} right
        </Text>
      </View>

      <CueCard cue={question.cue} onReadAloud={onReadCue} />

      <Text variant="overline" color="primary">
        And you say…
      </Text>

      <View style={styles.choices}>
        {question.choices.map((c) => (
          <AnswerChoice key={c.id} choice={c} isAnswer={c.id === question.answer.id} chosenId={chosenId} onChoose={() => onChoose(c.id)} />
        ))}
      </View>

      {chosenId ? <Button title={index + 1 < total ? 'Next card' : 'See results'} icon="chevron.right" onPress={onNext} /> : null}
    </>
  );
}

const styles = StyleSheet.create({
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  choices: { gap: Spacing.three },
});

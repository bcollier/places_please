import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ScriptLine } from '@/lib/types';

/**
 * One possible answer on a flash card. Once any answer is picked, the right one turns green, a wrong
 * pick turns red, and the rest fade.
 */
export function AnswerChoice({
  choice,
  isAnswer,
  chosenId,
  onChoose,
}: {
  choice: ScriptLine;
  isAnswer: boolean;
  chosenId: string | null;
  onChoose: () => void;
}) {
  const theme = useTheme();
  const answered = !!chosenId;
  const isChosen = choice.id === chosenId;
  const showRight = answered && isAnswer;
  const showWrong = isChosen && !isAnswer;

  return (
    <Pressable
      onPress={onChoose}
      disabled={answered}
      accessibilityRole="button"
      accessibilityState={{ selected: isChosen, disabled: answered }}
      accessibilityLabel={`${choice.text}${showRight ? ', correct' : showWrong ? ', incorrect' : ''}`}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: showRight ? theme.perfectSoft : showWrong ? theme.missSoft : theme.surface,
          borderColor: showRight ? theme.perfect : showWrong ? theme.miss : theme.border,
          opacity: answered && !showRight && !showWrong ? 0.55 : pressed ? 0.8 : 1,
        },
      ]}>
      <Text variant="body" style={styles.flex}>
        {choice.text}
      </Text>
      {showRight ? <Icon name="checkmark.circle.fill" size={22} color={theme.perfect} /> : null}
      {showWrong ? <Icon name="xmark.circle.fill" size={22} color={theme.miss} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
    borderCurve: 'continuous',
  },
  flex: { flex: 1 },
});

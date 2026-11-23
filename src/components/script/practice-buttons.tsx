import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { warmupAvailable } from '@/lib/rehearsal/warmup';
import type { ScriptLine } from '@/lib/types';

export type PracticeMode = 'run' | 'warmup' | 'listen';

/** Run Lines, Warm Up and Listen buttons for the lines currently in view. */
export function PracticeButtons({
  me,
  visibleLines,
  myLinesInView,
  onStart,
}: {
  me: string;
  visibleLines: ScriptLine[];
  myLinesInView: number;
  onStart: (mode: PracticeMode) => void;
}) {
  return (
    <View style={styles.modes}>
      <Button title="Run Lines" icon="mic.fill" onPress={() => onStart('run')} disabled={myLinesInView === 0} />
      <View style={styles.row}>
        <Button
          title="Warm Up"
          icon="rectangle.on.rectangle.angled"
          variant="secondary"
          size="medium"
          style={styles.flex}
          disabled={!warmupAvailable(visibleLines, me)}
          onPress={() => onStart('warmup')}
        />
        <Button title="Listen" icon="headphones" variant="secondary" size="medium" style={styles.flex} onPress={() => onStart('listen')} />
      </View>
    </View>
  );
}

/** Shown in place of the practice buttons until a character is chosen. */
export function ChooseCharacterHint() {
  const theme = useTheme();
  return (
    <Card style={{ backgroundColor: theme.primarySoft, borderColor: theme.primarySoft }}>
      <Text variant="callout">Choose your character above to start practicing.</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  modes: { gap: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.three },
  flex: { flex: 1 },
});

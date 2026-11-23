import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ScriptLine } from '@/lib/types';

/** The other character's line the actor must answer, with a button to hear it. */
export function CueCard({ cue, onReadAloud }: { cue: ScriptLine; onReadAloud: () => void }) {
  const theme = useTheme();
  return (
    <Card style={styles.cue}>
      <View style={styles.cueHeader}>
        <Text variant="overline" color="textSecondary">
          {cue.character} says
        </Text>
        <Pressable onPress={onReadAloud} accessibilityRole="button" accessibilityLabel="Read the cue aloud" hitSlop={10}>
          <Icon name="speaker.wave.2.fill" size={20} color={theme.primary} />
        </Pressable>
      </View>
      <Text variant="script">{cue.text}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  cue: { gap: Spacing.three, paddingVertical: Spacing.five },
  cueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});

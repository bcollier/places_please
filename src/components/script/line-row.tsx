import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ScriptLine } from '@/lib/types';

/** One line of the script; the actor's own lines are highlighted. `showScene` adds a scene heading above it. */
export function LineRow({ line, mine, showScene, onPress }: { line: ScriptLine; mine: boolean; showScene: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.lineWrap}>
      {showScene ? (
        <Text variant="overline" color="primary" style={styles.scene}>
          {line.scene}
        </Text>
      ) : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${line.character}: ${line.text}`}
        accessibilityHint="Edit this line"
        style={({ pressed }) => [
          styles.line,
          mine && { backgroundColor: theme.primarySoft, borderLeftColor: theme.primary },
          !mine && { borderLeftColor: 'transparent' },
          pressed && { opacity: 0.6 },
        ]}>
        <Text variant="caption" style={{ fontWeight: '700', color: mine ? theme.primary : theme.textSecondary, letterSpacing: 0.6 }}>
          {line.character}
        </Text>
        <Text variant="body" style={styles.lineText}>
          {line.text}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  lineWrap: { gap: Spacing.two },
  scene: { marginTop: Spacing.four },
  line: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.small,
    borderLeftWidth: 3,
    gap: 2,
    marginBottom: Spacing.one,
  },
  lineText: { fontSize: 16, lineHeight: 23 },
});

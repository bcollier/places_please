import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ScriptLine } from '@/lib/types';

/** A line in the Listen script view. Tap to play from it; `yourTurn` marks the silent gap left for your line. */
export function ListenLineRow({
  line,
  current,
  mine,
  yourTurn,
  onPress,
}: {
  line: ScriptLine;
  current: boolean;
  mine: boolean;
  yourTurn: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Play from ${line.character}: ${line.text}`}
      style={[styles.line, current && { backgroundColor: theme.primarySoft }, { borderLeftColor: current ? theme.primary : 'transparent' }]}>
      <Text variant="caption" style={{ fontWeight: '700', color: mine ? theme.primary : theme.textSecondary }}>
        {line.character}
        {yourTurn ? '  · your turn' : ''}
      </Text>
      <Text variant={current ? 'script' : 'body'} color={current ? 'text' : 'textSecondary'}>
        {line.text}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: { padding: Spacing.three, borderRadius: Radius.small, borderLeftWidth: 3, gap: 2 },
});

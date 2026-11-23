import { router } from 'expo-router';
import { StyleSheet } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { charactersByLineCount } from '@/lib/script-model';
import type { Script } from '@/lib/types';

export function CurrentScriptCard({ script }: { script: Script }) {
  const theme = useTheme();
  const myCount = script.my_character ? script.lines.filter((l) => l.character === script.my_character).length : 0;
  const top = charactersByLineCount(script.lines).slice(0, 3);
  return (
    <Card
      onPress={() => router.push({ pathname: '/scripts/[id]', params: { id: script.id } })}
      accessibilityLabel={`Now rehearsing ${script.title}. Open script.`}
      style={styles.currentCard}>
      <Text variant="overline" color="primary">
        Now rehearsing
      </Text>
      <Text variant="title" numberOfLines={2}>
        {script.title}
      </Text>
      {script.my_character ? (
        <Text variant="callout" color="textSecondary">
          You play <Text variant="callout" style={{ fontWeight: '700', color: theme.text }}>{script.my_character}</Text>
          {` · ${myCount} line${myCount === 1 ? '' : 's'} of ${script.lines.length}`}
        </Text>
      ) : (
        <Text variant="callout" color="primary" style={{ fontWeight: '600' }}>
          Tap to choose your character ({top.map((c) => c.name).join(', ')}…)
        </Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  currentCard: { gap: Spacing.two },
});

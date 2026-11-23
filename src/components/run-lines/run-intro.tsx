import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TIPS: [Parameters<typeof Icon>[0]['name'], string][] = [
  ['speaker.wave.2.fill', 'Your scene partner reads every other part out loud.'],
  ['mic.fill', 'After the tick, say your line. Pause when you’re finished, or tap I’m done.'],
  ['checkmark.circle.fill', 'A chime means word perfect, a soft tone means close, a buzz means missed (you’ll hear the line). After a mistake you can Try again or Keep going.'],
  ['headphones', 'Pocket your phone: it keeps going with the screen off.'],
];

/** Before the run starts: who you're playing, how many lines, and how Run Lines works. */
export function RunIntro({ me, myLines, onStart }: { me: string; myLines: number; onStart: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.intro}>
      <Text variant="overline" color="primary">
        You are {me}
      </Text>
      <Text variant="display">Ready when you are</Text>
      <Text variant="body" color="textSecondary">
        {myLines} of your lines in this run.
      </Text>
      <View style={styles.tips}>
        {TIPS.map(([icon, tip]) => (
          <View key={tip} style={styles.tip}>
            <Icon name={icon} size={20} color={theme.primary} />
            <Text variant="callout" style={styles.flex}>
              {tip}
            </Text>
          </View>
        ))}
      </View>
      <Button title="Start" icon="play.fill" onPress={onStart} />
    </View>
  );
}

const styles = StyleSheet.create({
  intro: { gap: Spacing.four, paddingTop: Spacing.four },
  tips: { gap: Spacing.four, marginVertical: Spacing.four },
  tip: { flexDirection: 'row', gap: Spacing.four, alignItems: 'flex-start' },
  flex: { flex: 1 },
});

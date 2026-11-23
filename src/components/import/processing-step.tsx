import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ImportProgress } from '@/lib/script-import';

/** 0–1 for the progress bar; nudged ahead so the current step already shows some progress. */
function progressFraction(progress: ImportProgress): number {
  return progress.total > 0 ? Math.min(1, (progress.done + 0.35) / progress.total) : 0;
}

export function ProcessingStep({ progress, onCancel }: { progress: ImportProgress; onCancel: () => void }) {
  const theme = useTheme();
  const percent = Math.round(progressFraction(progress) * 100);
  return (
    <Card style={styles.processing}>
      <Icon name="sparkles" size={28} color={theme.primary} />
      <Text variant="title">Reading your script</Text>
      <Text variant="callout" color="textSecondary">
        {progress.step}… This can take a minute for longer scripts.
      </Text>
      <View style={[styles.track, { backgroundColor: theme.border }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: percent }}>
        <View style={[styles.fill, { backgroundColor: theme.primary, width: `${percent}%` }]} />
      </View>
      <Button title="Cancel" variant="ghost" size="medium" onPress={onCancel} />
    </Card>
  );
}

const styles = StyleSheet.create({
  processing: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.six },
  track: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});

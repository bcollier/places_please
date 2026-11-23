import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lastScore, practiceStreak, sessionsThisWeek } from '@/lib/stats';
import type { PracticeSession } from '@/lib/types';

type IconName = Parameters<typeof Icon>[0]['name'];

export function StatsRow({ history }: { history: PracticeSession[] }) {
  const streak = practiceStreak(history);
  const week = sessionsThisWeek(history);
  const score = lastScore(history);
  return (
    <View style={styles.stats}>
      <Stat label="Day streak" value={String(streak)} icon="flame.fill" />
      <Stat label="This week" value={String(week)} icon="clock" />
      <Stat label="Last score" value={score === null ? '—' : `${Math.round(score)}%`} icon="sparkles" />
    </View>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  const theme = useTheme();
  return (
    <Card style={styles.stat} accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} size={16} color={theme.primary} />
      <Text variant="title">{value}</Text>
      <Text variant="caption">{label}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: Spacing.three },
  stat: { flex: 1, gap: 2, paddingVertical: Spacing.three },
});

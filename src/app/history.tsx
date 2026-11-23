import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { SessionRow } from '@/components/history/session-row';
import { EmptyState, ErrorView, LoadingView } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { usePracticeHistory } from '@/hooks/use-practice-history';
import { useTheme } from '@/hooks/use-theme';
import { practiceStreak } from '@/lib/stats';
import type { PracticeSession } from '@/lib/types';
import { useData } from '@/providers/data-provider';

export default function HistoryScreen() {
  const theme = useTheme();
  const { getScript } = useData();
  const { sessions, error, refreshing, load, refresh } = usePracticeHistory();

  if (error && !sessions) return <ErrorView message={error} onRetry={load} />;
  if (!sessions) return <LoadingView />;

  return (
    <FlatList
      data={sessions}
      keyExtractor={(s) => s.id}
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.primary} onRefresh={refresh} />}
      ListHeaderComponent={sessions.length > 0 ? <HistoryHeader sessions={sessions} /> : undefined}
      ListEmptyComponent={
        <EmptyState icon="clock" title="No rehearsals yet" message="Your Run Lines, Warm Up and Listen sessions will show up here." />
      }
      renderItem={({ item }) => (
        <SessionRow session={item} scriptTitle={item.script_id ? getScript(item.script_id)?.title : undefined} />
      )}
    />
  );
}

function HistoryHeader({ sessions }: { sessions: PracticeSession[] }) {
  const streak = practiceStreak(sessions);
  return (
    <View style={styles.header}>
      <Text variant="title">{streak > 0 ? `${streak}-day streak` : 'Keep it going'}</Text>
      <Text variant="callout" color="textSecondary">
        {sessions.length} session{sessions.length === 1 ? '' : 's'} logged
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  header: { gap: Spacing.one, marginBottom: Spacing.three },
});

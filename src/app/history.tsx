import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { EmptyState, ErrorView, LoadingView } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listPracticeHistory } from '@/lib/api';
import { toUserMessage } from '@/lib/errors';
import { formatDuration, formatRelativeDay, practiceStreak } from '@/lib/stats';
import type { PracticeMode, PracticeSession } from '@/lib/types';
import { useData } from '@/providers/data-provider';

const MODE_LABEL: Record<PracticeMode, string> = { run_lines: 'Run Lines', warmup: 'Warm Up', listen: 'Listen' };
const MODE_ICON = { run_lines: 'mic.fill', warmup: 'rectangle.on.rectangle.angled', listen: 'headphones' } as const;

export default function HistoryScreen() {
  const theme = useTheme();
  const { getScript } = useData();
  const [sessions, setSessions] = useState<PracticeSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSessions(await listPracticeHistory(200));
    } catch (err) {
      setError(toUserMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (error && !sessions) return <ErrorView message={error} onRetry={load} />;
  if (!sessions) return <LoadingView />;

  const streak = practiceStreak(sessions);

  return (
    <FlatList
      data={sessions}
      keyExtractor={(s) => s.id}
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={theme.primary}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      ListHeaderComponent={
        sessions.length > 0 ? (
          <View style={styles.header}>
            <Text variant="title">{streak > 0 ? `${streak}-day streak` : 'Keep it going'}</Text>
            <Text variant="callout" color="textSecondary">
              {sessions.length} session{sessions.length === 1 ? '' : 's'} logged
            </Text>
          </View>
        ) : undefined
      }
      ListEmptyComponent={
        <EmptyState icon="clock" title="No rehearsals yet" message="Your Run Lines, Warm Up and Listen sessions will show up here." />
      }
      renderItem={({ item }) => {
        const script = item.script_id ? getScript(item.script_id) : undefined;
        return (
          <Card style={styles.row}>
            <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}>
              <Icon name={MODE_ICON[item.mode]} size={18} color={theme.primary} />
            </View>
            <View style={styles.flex}>
              <Text variant="bodyStrong" numberOfLines={1}>
                {script?.title ?? 'Deleted script'}
              </Text>
              <Text variant="caption">
                {MODE_LABEL[item.mode]} · {formatRelativeDay(item.started_at)} · {formatDuration(item.duration_seconds)}
                {item.scene ? ` · ${item.scene}` : ''}
              </Text>
              {item.mode !== 'listen' ? (
                <Text variant="caption">
                  <Text variant="caption" style={{ color: theme.perfect, fontWeight: '600' }}>{item.perfect_count} perfect</Text>
                  {'  '}
                  <Text variant="caption" style={{ color: theme.close, fontWeight: '600' }}>{item.close_count} close</Text>
                  {'  '}
                  <Text variant="caption" style={{ color: theme.miss, fontWeight: '600' }}>{item.missed_count} missed</Text>
                </Text>
              ) : (
                <Text variant="caption">{item.lines_total} lines heard</Text>
              )}
            </View>
            {item.score !== null ? <Text variant="title">{Math.round(item.score)}%</Text> : null}
          </Card>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  header: { gap: Spacing.one, marginBottom: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
});

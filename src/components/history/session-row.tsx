import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatDuration, formatRelativeDay } from '@/lib/stats';
import type { PracticeMode, PracticeSession } from '@/lib/types';

const MODE_LABEL: Record<PracticeMode, string> = { run_lines: 'Run Lines', warmup: 'Warm Up', listen: 'Listen' };
const MODE_ICON = { run_lines: 'mic.fill', warmup: 'rectangle.on.rectangle.angled', listen: 'headphones' } as const;

function sessionDetails(session: PracticeSession): string {
  const base = `${MODE_LABEL[session.mode]} · ${formatRelativeDay(session.started_at)} · ${formatDuration(session.duration_seconds)}`;
  return session.scene ? `${base} · ${session.scene}` : base;
}

/** One practice session in the history list. `scriptTitle` is undefined when the script was deleted. */
export function SessionRow({ session, scriptTitle }: { session: PracticeSession; scriptTitle: string | undefined }) {
  const theme = useTheme();
  return (
    <Card style={styles.row}>
      <View style={[styles.icon, { backgroundColor: theme.primarySoft }]}>
        <Icon name={MODE_ICON[session.mode]} size={18} color={theme.primary} />
      </View>
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {scriptTitle ?? 'Deleted script'}
        </Text>
        <Text variant="caption">{sessionDetails(session)}</Text>
        {session.mode !== 'listen' ? (
          <SessionResults session={session} />
        ) : (
          <Text variant="caption">{session.lines_total} lines heard</Text>
        )}
      </View>
      {session.score !== null ? <Text variant="title">{Math.round(session.score)}%</Text> : null}
    </Card>
  );
}

function SessionResults({ session }: { session: PracticeSession }) {
  const theme = useTheme();
  return (
    <Text variant="caption">
      <Text variant="caption" style={{ color: theme.perfect, fontWeight: '600' }}>{session.perfect_count} perfect</Text>
      {'  '}
      <Text variant="caption" style={{ color: theme.close, fontWeight: '600' }}>{session.close_count} close</Text>
      {'  '}
      <Text variant="caption" style={{ color: theme.miss, fontWeight: '600' }}>{session.missed_count} missed</Text>
    </Text>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1, gap: 2 },
});

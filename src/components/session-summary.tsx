import { StyleSheet, View } from 'react-native';

import { SaveAccountPrompt } from '@/components/save-account-prompt';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { summarizeAttempts } from '@/lib/api';
import type { LineAttempt, ScriptLine } from '@/lib/types';

export function SessionSummary({
  attempts,
  lines,
  saveError,
  onRetrySave,
  onAgain,
  onDone,
  headline,
}: {
  attempts: LineAttempt[];
  lines: ScriptLine[];
  saveError: string | null;
  onRetrySave?: () => void;
  onAgain: () => void;
  onDone: () => void;
  headline?: string;
}) {
  const { perfect, close, missed, score } = summarizeAttempts(attempts);
  const missedLines = linesToWorkOn(attempts, lines);

  return (
    <View style={styles.wrap}>
      <Text variant="overline" color="primary">
        Curtain
      </Text>
      <Text variant="display">{headline ?? titleForScore(score)}</Text>
      {score !== null ? (
        <Text variant="body" color="textSecondary">
          Score {score}%
        </Text>
      ) : null}

      <VerdictCounts perfect={perfect} close={close} missed={missed} />

      {missedLines.length > 0 ? <LinesToWorkOn items={missedLines} /> : null}

      {saveError ? <SaveErrorNotice message={saveError} onRetry={onRetrySave} /> : null}

      <SaveAccountPrompt />

      <View style={styles.actions}>
        <Button title="Run it again" icon="arrow.clockwise" onPress={onAgain} />
        <Button title="Done" variant="secondary" onPress={onDone} />
      </View>
    </View>
  );
}

type MissedLine = { attempt: LineAttempt; line: ScriptLine };

/** Close and missed attempts, paired with their script lines. */
function linesToWorkOn(attempts: LineAttempt[], lines: ScriptLine[]): MissedLine[] {
  return attempts
    .filter((a) => a.verdict === 'missed' || a.verdict === 'close')
    .map((a) => ({ attempt: a, line: lines.find((l) => l.id === a.lineId) }))
    .filter((x): x is MissedLine => !!x.line);
}

function titleForScore(score: number | null) {
  if (score === null) return 'Scene complete';
  if (score >= 95) return 'Bravo!';
  if (score >= 75) return 'Nicely done';
  if (score >= 50) return 'Getting there';
  return 'Keep at it';
}

function VerdictCounts({ perfect, close, missed }: { perfect: number; close: number; missed: number }) {
  const theme = useTheme();
  return (
    <View style={styles.counts}>
      <Count label="Perfect" value={perfect} color={theme.perfect} bg={theme.perfectSoft} />
      <Count label="Close" value={close} color={theme.close} bg={theme.closeSoft} />
      <Count label="Missed" value={missed} color={theme.miss} bg={theme.missSoft} />
    </View>
  );
}

function LinesToWorkOn({ items }: { items: MissedLine[] }) {
  return (
    <View style={styles.review}>
      <Text variant="overline">Lines to work on</Text>
      {items.slice(0, 12).map(({ attempt, line }) => (
        <Card key={line.id} style={styles.reviewCard}>
          <Text variant="script" style={styles.reviewText}>
            {line.text}
          </Text>
          {attempt.transcript ? <Text variant="caption">You said: “{attempt.transcript}”</Text> : null}
        </Card>
      ))}
    </View>
  );
}

function SaveErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.saveError}>
      <Text variant="caption" color="miss">
        {message}
      </Text>
      {onRetry ? <Button title="Try saving again" size="small" variant="secondary" onPress={onRetry} /> : null}
    </View>
  );
}

function Count({ label, value, color, bg }: { label: string; value: number; color: string; bg: string }) {
  return (
    <View style={[styles.count, { backgroundColor: bg }]} accessibilityLabel={`${label}: ${value}`}>
      <Text variant="title" style={{ color }}>
        {value}
      </Text>
      <Text variant="caption" style={{ color, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.three },
  counts: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.three },
  count: { flex: 1, alignItems: 'center', paddingVertical: Spacing.four, borderRadius: 14 },
  review: { gap: Spacing.two, marginTop: Spacing.four },
  reviewCard: { gap: Spacing.one },
  reviewText: { fontSize: 18, lineHeight: 26 },
  actions: { gap: Spacing.three, marginTop: Spacing.five },
  saveError: { gap: Spacing.two, alignItems: 'flex-start' },
});

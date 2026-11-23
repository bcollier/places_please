import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { LineDiff } from '@/components/line-diff';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { VerdictBadge } from '@/components/verdict-badge';
import { VoiceMeter } from '@/components/voice-meter';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LastResult, RunnerPhase } from '@/lib/rehearsal/line-runner';

const PHASE_LABELS: Partial<Record<RunnerPhase, string>> = {
  partner: 'Speaking',
  listening: 'Listening',
  checking: 'Checking',
  prompting: 'Prompting',
  preparing: 'Getting ready',
  paused: 'Paused',
  review: 'Your call',
};

function voiceMeterMode(phase: RunnerPhase) {
  if (phase === 'listening') return 'listening';
  return phase === 'partner' || phase === 'prompting' ? 'speaking' : 'idle';
}

function showsVoiceMeter(phase: RunnerPhase) {
  return phase === 'listening' || phase === 'partner' || phase === 'prompting' || phase === 'checking';
}

/** The line being played or listened for, with live phase, voice meter and the latest verdict. */
export function CurrentLine({
  character,
  text,
  mine,
  phase,
  peek,
  last,
  level,
}: {
  character: string;
  text: string;
  mine: boolean;
  phase: RunnerPhase;
  peek: boolean;
  last: LastResult | null;
  level: number;
}) {
  const theme = useTheme();
  const revealed = !mine || peek || phase === 'feedback' || phase === 'prompting' || !!last;

  return (
    <Card style={[styles.lineCard, mine && { borderColor: theme.primary, backgroundColor: theme.surfaceRaised }]}>
      <View style={styles.lineHeader}>
        <Text variant="overline" color={mine ? 'primary' : 'textSecondary'}>
          {mine ? `Your line · ${character}` : character}
        </Text>
        <PhaseLabel phase={phase} mine={mine} />
      </View>

      {showsVoiceMeter(phase) ? <VoiceMeter mode={voiceMeterMode(phase)} level={level} height={mine ? 72 : 40} /> : null}

      <LineText text={text} phase={phase} revealed={revealed} last={last} />

      {last ? <LineFeedback last={last} /> : null}
    </Card>
  );
}

/** My line stays hidden until it's revealed; after a mistake it shows the word-by-word diff. */
function LineText({ text, phase, revealed, last }: { text: string; phase: RunnerPhase; revealed: boolean; last: LastResult | null }) {
  if (last?.score && last.verdict !== 'perfect' && revealed) return <LineDiff diff={last.score.diff} />;
  if (revealed) return <Text variant="script">{text}</Text>;
  return (
    <View style={styles.hidden}>
      <Text variant="callout" color="textSecondary">
        {phase === 'listening' ? 'Listening… say your line' : phase === 'checking' ? 'Checking…' : 'Your line is next'}
      </Text>
    </View>
  );
}

function LineFeedback({ last }: { last: LastResult }) {
  return (
    <View style={styles.feedback}>
      <VerdictBadge verdict={last.verdict} />
      {last.note ? <Text variant="caption">{last.note}</Text> : null}
      {last.transcript && last.verdict !== 'perfect' ? <Text variant="caption">You said: “{last.transcript}”</Text> : null}
    </View>
  );
}

function PhaseLabel({ phase, mine }: { phase: RunnerPhase; mine: boolean }) {
  const theme = useTheme();
  const label = PHASE_LABELS[phase];
  if (!label) return null;
  const color = phase === 'listening' && mine ? theme.primary : theme.textSecondary;
  return (
    <View style={[styles.phase, { borderColor: color }]}>
      <Text variant="caption" style={{ color, fontWeight: '600' }}>
        {label}
      </Text>
    </View>
  );
}

/** Shown in place of the line when the run stops with an error. */
export function LineErrorCard({ message, needsSignIn }: { message: string | null; needsSignIn: boolean }) {
  const theme = useTheme();
  return (
    <Card style={[styles.lineCard, { borderColor: theme.miss }]}>
      <Icon name="exclamationmark.circle.fill" size={28} color={theme.miss} />
      <Text variant="body">{message}</Text>
      {needsSignIn ? <Button title="Sign in with email" icon="envelope.fill" onPress={() => router.push('/account')} /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  lineCard: { gap: Spacing.four, paddingVertical: Spacing.five, minHeight: 220 },
  lineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  phase: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: Spacing.two, paddingVertical: 1 },
  hidden: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three, paddingVertical: Spacing.five },
  feedback: { gap: Spacing.two },
});

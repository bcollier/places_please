import { useAudioRecorder } from 'expo-audio';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LineDiff } from '@/components/line-diff';
import { VoiceMeter } from '@/components/voice-meter';
import { SessionSummary } from '@/components/session-summary';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ErrorView } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { VerdictBadge } from '@/components/verdict-badge';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useGenderGuess } from '@/hooks/use-gender-guess';
import { useSessionSaver } from '@/hooks/use-session-saver';
import { useTheme } from '@/hooks/use-theme';
import { SPEECH_RECORDING_OPTIONS } from '@/lib/audio/line-listener';
import { LineRunner, type RunnerState } from '@/lib/rehearsal/line-runner';
import { linesInScene } from '@/lib/script-model';
import { goBack } from '@/lib/navigation';
import { useData } from '@/providers/data-provider';

export default function RunLinesScreen() {
  const { id, scene } = useLocalSearchParams<{ id: string; scene?: string }>();
  const { getScript } = useData();
  const script = getScript(id);

  if (!script || !script.my_character) {
    return <ErrorView message="Choose your character on the script page first." onRetry={goBack} retryLabel="Go back" />;
  }
  return <RunLines key={`${script.id}-${scene ?? 'all'}`} scriptId={script.id} scene={scene ?? null} />;
}

function RunLines({ scriptId, scene }: { scriptId: string; scene: string | null }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getScript, settings } = useData();
  const script = getScript(scriptId)!;
  const me = script.my_character!;
  const lines = useMemo(() => linesInScene(script.lines, scene), [script.lines, scene]);

  const recorder = useAudioRecorder(SPEECH_RECORDING_OPTIONS);
  const { save, reset, saveError, isSaved } = useSessionSaver();
  const startedAt = useRef(new Date());
  const [peek, setPeek] = useState(false);

  const [runner] = useState(() => new LineRunner(lines, me, recorder, settings, script.character_genders));
  const [state, setState] = useState<RunnerState>(runner.getState());

  useEffect(() => runner.subscribe(setState), [runner]);
  useEffect(() => runner.updateGenders(script.character_genders), [runner, script.character_genders]);
  useGenderGuess(script);

  useEffect(() => {
    if (state.phase !== 'finished') return;
    void save({
      script_id: script.id,
      mode: 'run_lines',
      character: me,
      scene,
      started_at: startedAt.current,
      attempts: state.attempts,
      lines_total: lines.filter((l) => l.character === me).length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);

  // Leaving mid-scene: stop audio and keep whatever was practiced.
  useEffect(() => {
    return () => {
      const s = runner.getState();
      void runner.stop();
      if (!isSaved() && s.attempts.length > 0) {
        void save({
          script_id: script.id,
          mode: 'run_lines',
          character: me,
          scene,
          started_at: startedAt.current,
          attempts: s.attempts,
          lines_total: lines.filter((l) => l.character === me).length,
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runner]);

  const line = lines[state.index];
  const isMine = line?.character === me;
  const total = lines.length;
  const progress = total > 0 ? (state.index + (state.phase === 'finished' ? 1 : 0)) / total : 0;
  const active = !['idle', 'paused', 'finished', 'error'].includes(state.phase);

  const restart = () => {
    reset();
    startedAt.current = new Date();
    runner.restart();
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: scene ?? 'Run Lines',
          headerLeft: () => (
            <Button title="Close" variant="ghost" size="small" onPress={goBack} accessibilityLabel="Close Run Lines" />
          ),
        }}
      />
      <View style={[styles.screen, { backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.four }]}>
        <View style={[styles.track, { backgroundColor: theme.border }]}>
          <View style={[styles.fill, { backgroundColor: theme.primary, width: `${Math.round(progress * 100)}%` }]} />
        </View>

        {state.phase === 'finished' ? (
          <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
            <View style={styles.inner}>
              <SessionSummary
                attempts={state.attempts}
                lines={lines}
                saveError={saveError}
                onAgain={restart}
                onDone={goBack}
              />
            </View>
          </ScrollView>
        ) : state.phase === 'idle' ? (
          <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
            <View style={styles.inner}>
              <Intro me={me} myLines={lines.filter((l) => l.character === me).length} onStart={() => void runner.start(0)} />
            </View>
          </ScrollView>
        ) : (
          <>
            <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
              <View style={styles.inner}>
                <Text variant="overline">
                  Line {Math.min(state.index + 1, total)} of {total}
                </Text>

                {state.phase === 'error' ? (
                  <Card style={[styles.lineCard, { borderColor: theme.miss }]}>
                    <Icon name="exclamationmark.circle.fill" size={28} color={theme.miss} />
                    <Text variant="body">{state.error}</Text>
                    {state.errorCode === 'not_allowed' ? (
                      <Button title="Sign in with email" icon="envelope.fill" onPress={() => router.push('/account')} />
                    ) : null}
                  </Card>
                ) : line ? (
                  <CurrentLine
                    character={line.character}
                    text={line.text}
                    mine={isMine}
                    phase={state.phase}
                    peek={peek}
                    last={state.last?.lineId === line.id ? state.last : null}
                    level={state.level}
                  />
                ) : null}

                {state.phase === 'paused' ? (
                  <Text variant="callout" color="textSecondary" style={styles.center}>
                    Paused. Resume to pick up from this line.
                  </Text>
                ) : null}
              </View>
            </ScrollView>

            <View style={styles.controls}>
              {state.phase === 'review' ? (
                <View style={styles.row}>
                  <Button title="Try again" icon="arrow.clockwise" onPress={() => runner.tryAgain()} style={styles.flex} accessibilityHint="Hear the cue again and say the line again" />
                  <Button title="Keep going" icon="forward.fill" variant="secondary" onPress={() => runner.keepGoing()} style={styles.flex} />
                </View>
              ) : null}
              {state.phase === 'checking' ? (
                <Button
                  title="Skip checking this line"
                  variant="ghost"
                  size="medium"
                  onPress={() => runner.skipChecking()}
                  accessibilityHint="Move on without a verdict for this line"
                />
              ) : null}
              {state.phase === 'listening' ? (
                <View style={styles.row}>
                  <Button title="Line!" icon="hand.raised.fill" variant="secondary" onPress={() => runner.callForLine()} style={styles.flex} accessibilityHint="Hear your line. Counts as missed." />
                  <Button title="I'm done" icon="checkmark" onPress={() => runner.doneSpeaking()} style={styles.flex} />
                </View>
              ) : null}
              <View style={styles.row}>
                <Button
                  title="Back"
                  icon="backward.fill"
                  variant="ghost"
                  size="medium"
                  onPress={() => runner.jumpTo(previousMyLineStart(lines, me, state.index))}
                  accessibilityLabel="Go back to your previous line"
                  style={styles.flex}
                />
                {active ? (
                  <Button title="Pause" icon="pause.fill" variant="secondary" size="medium" onPress={() => runner.pause()} style={styles.flex} />
                ) : (
                  <Button title={state.phase === 'error' ? 'Try again' : 'Resume'} icon="play.fill" size="medium" onPress={() => runner.resume()} style={styles.flex} />
                )}
                <Button
                  title={peek ? 'Hide' : 'Peek'}
                  icon="text.bubble.fill"
                  variant="ghost"
                  size="medium"
                  onPress={() => setPeek((p) => !p)}
                  accessibilityLabel={peek ? 'Hide my lines' : 'Show my lines while practicing'}
                  style={styles.flex}
                />
              </View>
            </View>
          </>
        )}
      </View>
    </>
  );
}

/** Start of the cue before my previous line, so "back" replays my cue too. */
function previousMyLineStart(lines: { character: string }[], me: string, index: number) {
  for (let i = index - 1; i >= 0; i--) {
    if (lines[i].character === me) return Math.max(0, i - 1);
  }
  return 0;
}

function Intro({ me, myLines, onStart }: { me: string; myLines: number; onStart: () => void }) {
  const theme = useTheme();
  const tips: [Parameters<typeof Icon>[0]['name'], string][] = [
    ['speaker.wave.2.fill', 'Your scene partner reads every other part out loud.'],
    ['mic.fill', 'After the tick, say your line. Pause when you’re finished, or tap I’m done.'],
    ['checkmark.circle.fill', 'A chime means word perfect, a soft tone means close, a buzz means missed (you’ll hear the line). After a mistake you can Try again or Keep going.'],
    ['headphones', 'Pocket your phone: it keeps going with the screen off.'],
  ];
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
        {tips.map(([icon, tip]) => (
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

function CurrentLine({
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
  phase: RunnerState['phase'];
  peek: boolean;
  last: RunnerState['last'];
  level: number;
}) {
  const theme = useTheme();
  const meterMode = phase === 'listening' ? 'listening' : phase === 'partner' || phase === 'prompting' ? 'speaking' : 'idle';
  const showMeter = phase === 'listening' || phase === 'partner' || phase === 'prompting' || phase === 'checking';
  const revealed = !mine || peek || phase === 'feedback' || phase === 'prompting' || !!last;

  return (
    <Card style={[styles.lineCard, mine && { borderColor: theme.primary, backgroundColor: theme.surfaceRaised }]}>
      <View style={styles.lineHeader}>
        <Text variant="overline" color={mine ? 'primary' : 'textSecondary'}>
          {mine ? `Your line · ${character}` : character}
        </Text>
        <PhaseLabel phase={phase} mine={mine} />
      </View>

      {showMeter ? <VoiceMeter mode={meterMode} level={level} height={mine ? 72 : 40} /> : null}

      {last?.score && last.verdict !== 'perfect' && revealed ? (
        <LineDiff diff={last.score.diff} />
      ) : revealed ? (
        <Text variant="script">{text}</Text>
      ) : (
        <View style={styles.hidden}>
          <Text variant="callout" color="textSecondary">
            {phase === 'listening' ? 'Listening… say your line' : phase === 'checking' ? 'Checking…' : 'Your line is next'}
          </Text>
        </View>
      )}

      {last ? (
        <View style={styles.feedback}>
          <VerdictBadge verdict={last.verdict} />
          {last.note ? <Text variant="caption">{last.note}</Text> : null}
          {last.transcript && last.verdict !== 'perfect' ? <Text variant="caption">You said: “{last.transcript}”</Text> : null}
        </View>
      ) : null}
    </Card>
  );
}

function PhaseLabel({ phase, mine }: { phase: RunnerState['phase']; mine: boolean }) {
  const theme = useTheme();
  const label =
    phase === 'partner'
      ? 'Speaking'
      : phase === 'listening'
        ? 'Listening'
        : phase === 'checking'
          ? 'Checking'
          : phase === 'prompting'
            ? 'Prompting'
            : phase === 'preparing'
              ? 'Getting ready'
              : phase === 'paused'
                ? 'Paused'
                : phase === 'review'
                  ? 'Your call'
                  : '';
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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  track: { height: 3 },
  fill: { height: 3 },
  scroll: { padding: Spacing.four, alignItems: 'center', flexGrow: 1 },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four },
  lineCard: { gap: Spacing.four, paddingVertical: Spacing.five, minHeight: 220 },
  lineHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  phase: { borderWidth: 1, borderRadius: Radius.pill, paddingHorizontal: Spacing.two, paddingVertical: 1 },
  hidden: { alignItems: 'center', justifyContent: 'center', gap: Spacing.three, paddingVertical: Spacing.five },
  feedback: { gap: Spacing.two },
  controls: { paddingHorizontal: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  row: { flexDirection: 'row', gap: Spacing.three },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
  intro: { gap: Spacing.four, paddingTop: Spacing.four },
  tips: { gap: Spacing.four, marginVertical: Spacing.four },
  tip: { flexDirection: 'row', gap: Spacing.four, alignItems: 'flex-start' },
});

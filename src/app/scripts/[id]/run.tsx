import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CurrentLine, LineErrorCard } from '@/components/run-lines/line-card';
import { RunControls } from '@/components/run-lines/run-controls';
import { RunIntro } from '@/components/run-lines/run-intro';
import { SessionSummary } from '@/components/session-summary';
import { Button } from '@/components/ui/button';
import { ErrorView } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useGenderGuess } from '@/hooks/use-gender-guess';
import { useLineRunner } from '@/hooks/use-line-runner';
import { useTheme } from '@/hooks/use-theme';
import type { LineRunner, RunnerState } from '@/lib/rehearsal/line-runner';
import { linesInScene } from '@/lib/script-model';
import { goBack } from '@/lib/navigation';
import type { ScriptLine } from '@/lib/types';
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
  const { getScript } = useData();
  const script = getScript(scriptId)!;
  const me = script.my_character!;
  const lines = useMemo(() => linesInScene(script.lines, scene), [script.lines, scene]);

  const { runner, state, myLineCount, restart, saveError, retrySave } = useLineRunner(script, lines, scene);
  useGenderGuess(script);
  // Lives here (not in the in-progress view) so Peek stays on across "Run it again".
  const [peek, setPeek] = useState(false);

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
        <ProgressTrack progress={runProgress(state, lines.length)} />

        {state.phase === 'finished' ? (
          <ScrollColumn>
            <SessionSummary
              attempts={state.attempts}
              lines={lines}
              saveError={saveError}
              onRetrySave={retrySave}
              onAgain={restart}
              onDone={goBack}
            />
          </ScrollColumn>
        ) : state.phase === 'idle' ? (
          <ScrollColumn>
            <RunIntro me={me} myLines={myLineCount} onStart={() => void runner.start(0)} />
          </ScrollColumn>
        ) : (
          <RunInProgress runner={runner} state={state} lines={lines} me={me} peek={peek} onTogglePeek={() => setPeek((p) => !p)} />
        )}
      </View>
    </>
  );
}

function runProgress(state: RunnerState, total: number) {
  return total > 0 ? (state.index + (state.phase === 'finished' ? 1 : 0)) / total : 0;
}

function ProgressTrack({ progress }: { progress: number }) {
  const theme = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: theme.border }]}>
      <View style={[styles.fill, { backgroundColor: theme.primary, width: `${Math.round(progress * 100)}%` }]} />
    </View>
  );
}

function ScrollColumn({ children }: { children: ReactNode }) {
  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      <View style={styles.inner}>{children}</View>
    </ScrollView>
  );
}

/** Everything between Start and the curtain: the current line (or error) and the controls. */
function RunInProgress({
  runner,
  state,
  lines,
  me,
  peek,
  onTogglePeek,
}: {
  runner: LineRunner;
  state: RunnerState;
  lines: ScriptLine[];
  me: string;
  peek: boolean;
  onTogglePeek: () => void;
}) {
  const line = lines[state.index];
  const total = lines.length;

  return (
    <>
      <ScrollColumn>
        <Text variant="overline">
          Line {Math.min(state.index + 1, total)} of {total}
        </Text>

        {state.phase === 'error' ? (
          <LineErrorCard message={state.error} needsSignIn={state.errorCode === 'not_allowed'} />
        ) : line ? (
          <CurrentLine
            character={line.character}
            text={line.text}
            mine={line.character === me}
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
      </ScrollColumn>

      <RunControls runner={runner} state={state} lines={lines} me={me} peek={peek} onTogglePeek={onTogglePeek} />
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  track: { height: 3 },
  fill: { height: 3 },
  scroll: { padding: Spacing.four, alignItems: 'center', flexGrow: 1 },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four },
  flex: { flex: 1 },
  center: { textAlign: 'center' },
});

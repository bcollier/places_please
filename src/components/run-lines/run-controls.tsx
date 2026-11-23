import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { LineRunner, RunnerPhase, RunnerState } from '@/lib/rehearsal/line-runner';

/** Phases where the runner is doing something, so the main button pauses instead of resuming. */
function isRunning(phase: RunnerPhase) {
  return !['idle', 'paused', 'finished', 'error'].includes(phase);
}

/** Start of the cue before my previous line, so "back" replays my cue too. */
function previousMyLineStart(lines: { character: string }[], me: string, index: number) {
  for (let i = index - 1; i >= 0; i--) {
    if (lines[i].character === me) return Math.max(0, i - 1);
  }
  return 0;
}

/** Buttons under the line: phase-specific actions on top, then Back / Pause-Resume / Peek. */
export function RunControls({
  runner,
  state,
  lines,
  me,
  peek,
  onTogglePeek,
}: {
  runner: LineRunner;
  state: RunnerState;
  lines: { character: string }[];
  me: string;
  peek: boolean;
  onTogglePeek: () => void;
}) {
  return (
    <View style={styles.controls}>
      {state.phase === 'review' ? <ReviewChoices runner={runner} /> : null}
      {state.phase === 'checking' ? (
        <Button
          title="Skip checking this line"
          variant="ghost"
          size="medium"
          onPress={() => runner.skipChecking()}
          accessibilityHint="Move on without a verdict for this line"
        />
      ) : null}
      {state.phase === 'listening' ? <ListeningActions runner={runner} /> : null}
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
        <PauseResumeButton runner={runner} phase={state.phase} />
        <Button
          title={peek ? 'Hide' : 'Peek'}
          icon="text.bubble.fill"
          variant="ghost"
          size="medium"
          onPress={onTogglePeek}
          accessibilityLabel={peek ? 'Hide my lines' : 'Show my lines while practicing'}
          style={styles.flex}
        />
      </View>
    </View>
  );
}

/** After a mistake (when the actor chose to pause on mistakes). */
function ReviewChoices({ runner }: { runner: LineRunner }) {
  return (
    <View style={styles.row}>
      <Button title="Try again" icon="arrow.clockwise" onPress={() => runner.tryAgain()} style={styles.flex} accessibilityHint="Hear the cue again and say the line again" />
      <Button title="Keep going" icon="forward.fill" variant="secondary" onPress={() => runner.keepGoing()} style={styles.flex} />
    </View>
  );
}

function ListeningActions({ runner }: { runner: LineRunner }) {
  return (
    <View style={styles.row}>
      <Button title="Line!" icon="hand.raised.fill" variant="secondary" onPress={() => runner.callForLine()} style={styles.flex} accessibilityHint="Hear your line. Counts as missed." />
      <Button title="I'm done" icon="checkmark" onPress={() => runner.doneSpeaking()} style={styles.flex} />
    </View>
  );
}

function PauseResumeButton({ runner, phase }: { runner: LineRunner; phase: RunnerPhase }) {
  if (isRunning(phase)) {
    return <Button title="Pause" icon="pause.fill" variant="secondary" size="medium" onPress={() => runner.pause()} style={styles.flex} />;
  }
  return <Button title={phase === 'error' ? 'Try again' : 'Resume'} icon="play.fill" size="medium" onPress={() => runner.resume()} style={styles.flex} />;
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: Spacing.four, gap: Spacing.three, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  row: { flexDirection: 'row', gap: Spacing.three },
  flex: { flex: 1 },
});

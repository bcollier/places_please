import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SessionSummary } from '@/components/session-summary';
import { Button } from '@/components/ui/button';
import { ErrorView } from '@/components/ui/state-views';
import { WarmupQuestion } from '@/components/warmup/warmup-question';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useCueReader } from '@/hooks/use-cue-reader';
import { useTheme } from '@/hooks/use-theme';
import { useWarmupRound } from '@/hooks/use-warmup-round';
import { goBack } from '@/lib/navigation';
import { warmupAvailable } from '@/lib/rehearsal/warmup';
import { linesInScene } from '@/lib/script-model';
import { useData } from '@/providers/data-provider';

export default function WarmupScreen() {
  const { id, scene } = useLocalSearchParams<{ id: string; scene?: string }>();
  const { getScript } = useData();
  const script = getScript(id);
  if (!script?.my_character) {
    return <ErrorView message="Choose your character on the script page first." onRetry={goBack} retryLabel="Go back" />;
  }
  const lines = linesInScene(script.lines, scene ?? null);
  if (!warmupAvailable(lines, script.my_character)) {
    return (
      <ErrorView
        message="Warm Up needs at least one of your lines that follows someone else's line."
        onRetry={goBack}
        retryLabel="Go back"
      />
    );
  }
  return <Warmup key={`${script.id}-${scene ?? 'all'}`} scriptId={script.id} scene={scene ?? null} />;
}

function Warmup({ scriptId, scene }: { scriptId: string; scene: string | null }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getScript } = useData();
  const script = getScript(scriptId)!;
  const me = script.my_character!;
  const lines = useMemo(() => linesInScene(script.lines, scene), [script.lines, scene]);
  const round = useWarmupRound(script.id, lines, me, scene);
  const { readCue, stopCue } = useCueReader(lines, me, script.character_genders);
  const { question } = round;

  const nextCard = () => {
    stopCue();
    round.next();
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Warm Up',
          headerLeft: () => <Button title="Close" variant="ghost" size="small" onPress={goBack} />,
        }}
      />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.seven }]}>
        <View style={styles.inner}>
          {round.finished ? (
            <SessionSummary
              attempts={round.attempts}
              lines={lines}
              saveError={round.saveError}
              onRetrySave={round.retrySave}
              onAgain={round.again}
              onDone={goBack}
              headline={`${round.rightCount} of ${round.questions.length} right`}
            />
          ) : question ? (
            <WarmupQuestion
              question={question}
              index={round.index}
              total={round.questions.length}
              rightCount={round.rightCount}
              chosenId={round.chosen}
              onChoose={round.choose}
              onReadCue={() => void readCue(question.cue)}
              onNext={nextCard}
            />
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four },
});

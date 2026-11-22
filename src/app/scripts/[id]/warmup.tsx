import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SessionSummary } from '@/components/session-summary';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { ErrorView } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useSessionSaver } from '@/hooks/use-session-saver';
import { useTheme } from '@/hooks/use-theme';
import { Cancellation } from '@/lib/audio/cancel';
import { playSound, preloadSounds } from '@/lib/audio/sfx';
import { castVoices, speak, stopSpeaking } from '@/lib/audio/tts';
import { buildWarmupRound, warmupAvailable, type WarmupQuestion } from '@/lib/rehearsal/warmup';
import { linesInScene, uniqueCharacters } from '@/lib/script-model';
import type { LineAttempt } from '@/lib/types';
import { goBack } from '@/lib/navigation';
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
  const { getScript, settings } = useData();
  const script = getScript(scriptId)!;
  const me = script.my_character!;
  const lines = useMemo(() => linesInScene(script.lines, scene), [script.lines, scene]);

  const [questions, setQuestions] = useState<WarmupQuestion[]>(() => buildWarmupRound(lines, me));
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<LineAttempt[]>([]);
  const startedAt = useRef(new Date());
  const speechToken = useRef<Cancellation | null>(null);
  const { save, retry, reset, saveError } = useSessionSaver();

  useEffect(() => {
    preloadSounds();
    return () => {
      speechToken.current?.cancel();
      stopSpeaking();
    };
  }, []);

  const finished = index >= questions.length;
  const q = questions[index];

  useEffect(() => {
    if (finished && attempts.length > 0) {
      void save({
        script_id: script.id,
        mode: 'warmup',
        character: me,
        scene,
        started_at: startedAt.current,
        attempts,
        lines_total: questions.length,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const choose = (lineId: string) => {
    if (chosen || !q) return;
    setChosen(lineId);
    const correct = lineId === q.answer.id;
    setAttempts((a) => [...a, { lineId: q.answer.id, verdict: correct ? 'perfect' : 'missed', accuracy: correct ? 1 : 0 }]);
    void Haptics.notificationAsync(correct ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error).catch(() => {});
    void playSound(correct ? 'perfect' : 'miss');
  };

  const next = () => {
    speechToken.current?.cancel();
    setChosen(null);
    setIndex((i) => i + 1);
  };

  const readCue = async () => {
    if (!q) return;
    speechToken.current?.cancel();
    const token = new Cancellation();
    speechToken.current = token;
    try {
      const voices = await castVoices({
        characters: uniqueCharacters(lines),
        me,
        genders: script.character_genders,
        engine: settings.voiceEngine,
      });
      await speak(q.cue.text, voices.forCharacter(q.cue.character), settings.speechRate, token);
    } catch {
      // cancelled or speech unavailable: nothing to do
    }
  };

  const again = () => {
    reset();
    startedAt.current = new Date();
    setQuestions(buildWarmupRound(lines, me));
    setAttempts([]);
    setChosen(null);
    setIndex(0);
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
          {finished ? (
            <SessionSummary
              attempts={attempts}
              lines={lines}
              saveError={saveError}
              onRetrySave={retry}
              onAgain={again}
              onDone={goBack}
              headline={`${attempts.filter((a) => a.verdict === 'perfect').length} of ${questions.length} right`}
            />
          ) : q ? (
            <>
              <View style={styles.progressRow}>
                <Text variant="overline">
                  Card {index + 1} of {questions.length}
                </Text>
                <Text variant="overline" color="perfect">
                  {attempts.filter((a) => a.verdict === 'perfect').length} right
                </Text>
              </View>

              <Card style={styles.cue}>
                <View style={styles.cueHeader}>
                  <Text variant="overline" color="textSecondary">
                    {q.cue.character} says
                  </Text>
                  <Pressable onPress={readCue} accessibilityRole="button" accessibilityLabel="Read the cue aloud" hitSlop={10}>
                    <Icon name="speaker.wave.2.fill" size={20} color={theme.primary} />
                  </Pressable>
                </View>
                <Text variant="script">{q.cue.text}</Text>
              </Card>

              <Text variant="overline" color="primary">
                And you say…
              </Text>

              <View style={styles.choices}>
                {q.choices.map((c) => {
                  const isAnswer = c.id === q.answer.id;
                  const isChosen = c.id === chosen;
                  const showRight = !!chosen && isAnswer;
                  const showWrong = isChosen && !isAnswer;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => choose(c.id)}
                      disabled={!!chosen}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isChosen, disabled: !!chosen }}
                      accessibilityLabel={`${c.text}${showRight ? ', correct' : showWrong ? ', incorrect' : ''}`}
                      style={({ pressed }) => [
                        styles.choice,
                        {
                          backgroundColor: showRight ? theme.perfectSoft : showWrong ? theme.missSoft : theme.surface,
                          borderColor: showRight ? theme.perfect : showWrong ? theme.miss : theme.border,
                          opacity: chosen && !showRight && !showWrong ? 0.55 : pressed ? 0.8 : 1,
                        },
                      ]}>
                      <Text variant="body" style={styles.flex}>
                        {c.text}
                      </Text>
                      {showRight ? <Icon name="checkmark.circle.fill" size={22} color={theme.perfect} /> : null}
                      {showWrong ? <Icon name="xmark.circle.fill" size={22} color={theme.miss} /> : null}
                    </Pressable>
                  );
                })}
              </View>

              {chosen ? <Button title={index + 1 < questions.length ? 'Next card' : 'See results'} icon="chevron.right" onPress={next} /> : null}
            </>
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between' },
  cue: { gap: Spacing.three, paddingVertical: Spacing.five },
  cueHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  choices: { gap: Spacing.three },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
    borderCurve: 'continuous',
  },
  flex: { flex: 1 },
});

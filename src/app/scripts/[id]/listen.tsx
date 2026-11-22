import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { ErrorView } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useGenderGuess } from '@/hooks/use-gender-guess';
import { useSessionSaver } from '@/hooks/use-session-saver';
import { useTheme } from '@/hooks/use-theme';
import { ListenPlayer, type ListenState } from '@/lib/rehearsal/listen-player';
import { linesInScene } from '@/lib/script-model';
import type { ScriptLine } from '@/lib/types';
import { goBack } from '@/lib/navigation';
import { useData } from '@/providers/data-provider';

const SPEEDS = [0.8, 1, 1.2] as const;

export default function ListenScreen() {
  const { id, scene } = useLocalSearchParams<{ id: string; scene?: string }>();
  const { getScript } = useData();
  const script = getScript(id);
  if (!script) return <ErrorView message="This script couldn't be found." onRetry={goBack} retryLabel="Go back" />;
  return <Listen key={`${script.id}-${scene ?? 'all'}`} scriptId={script.id} scene={scene ?? null} />;
}

function Listen({ scriptId, scene }: { scriptId: string; scene: string | null }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { getScript, settings, updateSettings } = useData();
  const script = getScript(scriptId)!;
  const me = script.my_character;
  const lines = useMemo(() => linesInScene(script.lines, scene), [script.lines, scene]);
  const listRef = useRef<FlatList<ScriptLine>>(null);
  const startedAt = useRef(new Date());
  const { save } = useSessionSaver();

  const [readsMine, setReadsMine] = useState(settings.listenReadsMyLines);
  const [rate, setRate] = useState(settings.speechRate);

  const saveSession = (heard: number) => {
    if (heard === 0) return;
    void save({
      script_id: script.id,
      mode: 'listen',
      character: me,
      scene,
      started_at: startedAt.current,
      attempts: [],
      lines_total: heard,
    });
  };

  const [player] = useState(() => new ListenPlayer(lines, me, settings, script.character_genders));
  const [state, setState] = useState<ListenState>(player.getState());

  useEffect(() => player.subscribe(setState), [player]);
  useEffect(() => player.updateGenders(script.character_genders), [player, script.character_genders]);
  useGenderGuess(script);
  useEffect(() => {
    if (state.phase === 'finished') saveSession(player.heardCount());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase]);
  useEffect(
    () => () => {
      void player.stop();
      saveSession(player.heardCount());
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [player],
  );

  useEffect(() => {
    if (lines.length > 0) {
      listRef.current?.scrollToIndex({ index: Math.min(state.index, lines.length - 1), viewPosition: 0.3, animated: true });
    }
  }, [state.index, lines.length]);

  const playing = state.phase === 'playing';

  const toggleReadsMine = (value: boolean) => {
    setReadsMine(value);
    player.updateSettings({ listenReadsMyLines: value });
    void updateSettings({ listenReadsMyLines: value }).catch(() => {});
  };

  const changeRate = (value: number) => {
    setRate(value);
    player.updateSettings({ speechRate: value });
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: scene ?? 'Listen',
          headerLeft: () => <Button title="Close" variant="ghost" size="small" onPress={goBack} />,
        }}
      />
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <FlatList
          ref={listRef}
          data={lines}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.list}
          onScrollToIndexFailed={({ index }) => {
            setTimeout(() => listRef.current?.scrollToIndex({ index, viewPosition: 0.3, animated: false }), 100);
          }}
          renderItem={({ item, index }) => {
            const current = index === state.index;
            const mine = item.character === me;
            return (
              <Pressable
                onPress={() => void player.play(index)}
                accessibilityRole="button"
                accessibilityLabel={`Play from ${item.character}: ${item.text}`}
                style={[
                  styles.line,
                  current && { backgroundColor: theme.primarySoft },
                  { borderLeftColor: current ? theme.primary : 'transparent' },
                ]}>
                <Text variant="caption" style={{ fontWeight: '700', color: mine ? theme.primary : theme.textSecondary }}>
                  {item.character}
                  {mine && current && state.gap ? '  · your turn' : ''}
                </Text>
                <Text variant={current ? 'script' : 'body'} color={current ? 'text' : 'textSecondary'}>
                  {item.text}
                </Text>
              </Pressable>
            );
          }}
        />

        <View style={[styles.panel, { borderTopColor: theme.border, backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.three }]}>
          {state.phase === 'error' ? (
            <Text variant="caption" color="miss">
              {state.error}
            </Text>
          ) : null}
          {state.phase === 'finished' ? (
            <Text variant="callout" color="textSecondary" style={styles.center}>
              That’s the end of the scene.
            </Text>
          ) : null}

          <View style={styles.transport}>
            <RoundButton icon="backward.fill" label="Previous line" onPress={() => player.skip(-1)} />
            <RoundButton
              icon={playing ? 'pause.fill' : 'play.fill'}
              label={playing ? 'Pause' : 'Play'}
              large
              onPress={() => (playing ? player.pause() : void player.play())}
            />
            <RoundButton icon="forward.fill" label="Next line" onPress={() => player.skip(1)} />
          </View>

          <View style={styles.optionsRow}>
            <View style={styles.speeds}>
              {SPEEDS.map((s) => (
                <Chip key={s} label={`${s}×`} selected={rate === s} onPress={() => changeRate(s)} />
              ))}
            </View>
            {me ? (
              <View style={styles.switchRow}>
                <Text variant="caption">Read my lines</Text>
                <Switch
                  value={readsMine}
                  onValueChange={toggleReadsMine}
                  trackColor={{ true: theme.primary }}
                  accessibilityLabel="Read my lines aloud. Off leaves a pause for you to say them."
                />
              </View>
            ) : null}
          </View>
        </View>
      </View>
    </>
  );
}

function RoundButton({
  icon,
  label,
  onPress,
  large,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  label: string;
  onPress: () => void;
  large?: boolean;
}) {
  const theme = useTheme();
  const size = large ? 72 : 52;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: large ? theme.primary : theme.surface,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <Icon name={icon} size={large ? 28 : 20} color={large ? theme.onPrimary : theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: Spacing.four, gap: Spacing.one, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  line: { padding: Spacing.three, borderRadius: Radius.small, borderLeftWidth: 3, gap: 2 },
  panel: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.four, paddingHorizontal: Spacing.four, gap: Spacing.four },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.six },
  optionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three, flexWrap: 'wrap' },
  speeds: { flexDirection: 'row', gap: Spacing.two },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  center: { textAlign: 'center' },
});

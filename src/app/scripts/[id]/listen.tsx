import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';

import { ListenLineRow } from '@/components/listen/listen-line-row';
import { ListenPanel } from '@/components/listen/listen-panel';
import { Button } from '@/components/ui/button';
import { ErrorView } from '@/components/ui/state-views';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useFollowCurrentLine } from '@/hooks/use-follow-current-line';
import { useListenPlayer } from '@/hooks/use-listen-player';
import { useTheme } from '@/hooks/use-theme';
import { goBack } from '@/lib/navigation';
import { linesInScene } from '@/lib/script-model';
import { useData } from '@/providers/data-provider';

export default function ListenScreen() {
  const { id, scene } = useLocalSearchParams<{ id: string; scene?: string }>();
  const { getScript } = useData();
  const script = getScript(id);
  if (!script) return <ErrorView message="This script couldn't be found." onRetry={goBack} retryLabel="Go back" />;
  return <Listen key={`${script.id}-${scene ?? 'all'}`} scriptId={script.id} scene={scene ?? null} />;
}

function Listen({ scriptId, scene }: { scriptId: string; scene: string | null }) {
  const theme = useTheme();
  const { getScript } = useData();
  const script = getScript(scriptId)!;
  const me = script.my_character;
  const lines = useMemo(() => linesInScene(script.lines, scene), [script.lines, scene]);
  const { player, state } = useListenPlayer(script, lines, scene);
  const { listRef, onScrollToIndexFailed } = useFollowCurrentLine(state.index, lines.length);

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
          onScrollToIndexFailed={onScrollToIndexFailed}
          renderItem={({ item, index }) => {
            const current = index === state.index;
            const mine = item.character === me;
            return (
              <ListenLineRow
                line={item}
                current={current}
                mine={mine}
                yourTurn={mine && current && state.gap}
                onPress={() => void player.play(index)}
              />
            );
          }}
        />
        <ListenPanel player={player} state={state} me={me} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  list: { padding: Spacing.four, gap: Spacing.one, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
});

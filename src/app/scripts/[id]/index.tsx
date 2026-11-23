import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DeleteScriptButton } from '@/components/script/delete-script-button';
import { LineRow } from '@/components/script/line-row';
import { ScriptHeader } from '@/components/script/script-header';
import { ErrorView } from '@/components/ui/state-views';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useGenderGuess } from '@/hooks/use-gender-guess';
import { useTheme } from '@/hooks/use-theme';
import { goBack } from '@/lib/navigation';
import { linesInScene } from '@/lib/script-model';
import type { ScriptLine } from '@/lib/types';
import { useData } from '@/providers/data-provider';

export default function ScriptScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string; pick?: string }>();
  const { getScript } = useData();
  const script = getScript(id);
  useGenderGuess(script);

  const [scene, setScene] = useState<string | null>(null);
  const visibleLines = useMemo(() => (script ? linesInScene(script.lines, scene) : []), [script, scene]);

  if (!script) {
    return <ErrorView message="This script couldn't be found. It may have been deleted." onRetry={goBack} retryLabel="Go back" />;
  }

  // A scene heading goes above the first line of each scene, but only when showing the whole script.
  const startsNewScene = (line: ScriptLine, index: number) =>
    !scene && line.scene !== null && line.scene !== visibleLines[index - 1]?.scene;

  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <FlatList
        data={visibleLines}
        keyExtractor={(l) => l.id}
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.seven }]}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={<ScriptHeader script={script} scene={scene} onSceneChange={setScene} visibleLines={visibleLines} />}
        renderItem={({ item, index }) => (
          <LineRow
            line={item}
            mine={item.character === script.my_character}
            showScene={startsNewScene(item, index)}
            onPress={() => router.push({ pathname: '/scripts/[id]/line/[lineId]', params: { id: script.id, lineId: item.id } })}
          />
        )}
        ListFooterComponent={<DeleteScriptButton script={script} />}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.four, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
});

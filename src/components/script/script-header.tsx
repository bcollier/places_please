import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { CharacterPicker } from '@/components/script/character-picker';
import { ChooseCharacterHint, PracticeButtons, type PracticeMode } from '@/components/script/practice-buttons';
import { SceneFilter } from '@/components/script/scene-filter';
import { ScriptTitle } from '@/components/script/script-title';
import { VoicesSection } from '@/components/script/voices-section';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { showAlert } from '@/lib/dialogs';
import { toUserMessage } from '@/lib/errors';
import { charactersByLineCount, scenesWithCharacter } from '@/lib/script-model';
import type { Script, ScriptLine } from '@/lib/types';
import { useData } from '@/providers/data-provider';

/** Everything above the line list on the script screen: title, casting, scene choice and practice buttons. */
export function ScriptHeader({
  script,
  scene,
  onSceneChange,
  visibleLines,
}: {
  script: Script;
  scene: string | null;
  onSceneChange: (scene: string | null) => void;
  visibleLines: ScriptLine[];
}) {
  const { saveScript, setCurrentScript } = useData();
  const me = script.my_character;
  const characters = useMemo(() => charactersByLineCount(script.lines), [script]);
  const scenes = useMemo(() => (script.my_character ? scenesWithCharacter(script.lines, script.my_character) : []), [script]);
  const myLinesInView = me ? visibleLines.filter((l) => l.character === me).length : 0;

  const chooseCharacter = async (name: string) => {
    if (name === me) return;
    try {
      await saveScript(script.id, { my_character: name });
      onSceneChange(null);
      setCurrentScript(script.id);
    } catch (err) {
      showAlert('Not saved', toUserMessage(err));
    }
  };

  const startPractice = (mode: PracticeMode) => {
    setCurrentScript(script.id);
    const params = { id: script.id, ...(scene ? { scene } : {}) };
    if (mode === 'run') router.push({ pathname: '/scripts/[id]/run', params });
    else if (mode === 'warmup') router.push({ pathname: '/scripts/[id]/warmup', params });
    else router.push({ pathname: '/scripts/[id]/listen', params });
  };

  return (
    <View style={styles.header}>
      <ScriptTitle script={script} />
      <CharacterPicker characters={characters} me={me} onChoose={(name) => void chooseCharacter(name)} />
      {me && scenes.length > 1 ? <SceneFilter scenes={scenes} scene={scene} onChange={onSceneChange} /> : null}
      {me ? (
        <PracticeButtons me={me} visibleLines={visibleLines} myLinesInView={myLinesInView} onStart={startPractice} />
      ) : (
        <ChooseCharacterHint />
      )}
      <VoicesSection script={script} />
      <View style={styles.linesHeader}>
        <Text variant="overline">
          {visibleLines.length} lines{me ? ` · ${myLinesInView} yours` : ''}
        </Text>
        <Text variant="caption">Tap a line to fix it</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: Spacing.five, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  linesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.two },
});

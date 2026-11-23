import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ModeTile } from '@/components/mode-tile';
import { Spacing } from '@/constants/theme';
import { warmupAvailable } from '@/lib/rehearsal/warmup';
import type { Script } from '@/lib/types';
import { useData } from '@/providers/data-provider';

type Mode = 'run' | 'warmup' | 'listen';

/** The three practice-mode tiles for the current script. */
export function PracticeModes({ script }: { script: Script }) {
  const { setCurrentScript } = useData();

  // Without a character there's nothing to practice yet, so send the actor to pick one first.
  const openMode = (mode: Mode) => {
    setCurrentScript(script.id);
    if (!script.my_character) {
      router.push({ pathname: '/scripts/[id]', params: { id: script.id, pick: '1' } });
      return;
    }
    router.push({ pathname: `/scripts/[id]/${mode}`, params: { id: script.id } });
  };

  return (
    <View style={styles.section}>
      <ModeTile
        emphasis
        icon="mic.fill"
        title="Run Lines"
        description="Your AI scene partner reads cues and checks every word."
        onPress={() => openMode('run')}
      />
      <ModeTile
        icon="rectangle.on.rectangle.angled"
        title="Warm Up"
        description="Flash cards: pick the line that follows each cue."
        disabled={!!script.my_character && !warmupAvailable(script.lines, script.my_character)}
        onPress={() => openMode('warmup')}
      />
      <ModeTile
        icon="headphones"
        title="Listen"
        description="Hear the scene read aloud. Works with the screen off."
        onPress={() => openMode('listen')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.three },
});

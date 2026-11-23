import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';

/** Choose whether to practice the whole script or a single scene. `null` means the whole script. */
export function SceneFilter({
  scenes,
  scene,
  onChange,
}: {
  scenes: string[];
  scene: string | null;
  onChange: (scene: string | null) => void;
}) {
  return (
    <View style={styles.section}>
      <Text variant="overline">Practice</Text>
      <View style={styles.chips}>
        <Chip label="Whole script" selected={scene === null} onPress={() => onChange(null)} />
        {scenes.map((s) => (
          <Chip key={s} label={s} selected={scene === s} onPress={() => onChange(s)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});

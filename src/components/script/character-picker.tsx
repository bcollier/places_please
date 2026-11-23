import { StyleSheet, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';

/** "Who are you playing?": one chip per character, with their line count. */
export function CharacterPicker({
  characters,
  me,
  onChoose,
}: {
  characters: { name: string; count: number }[];
  me: string | null;
  onChoose: (name: string) => void;
}) {
  return (
    <View style={styles.section}>
      <Text variant="overline" color={me ? 'textSecondary' : 'primary'}>
        {me ? 'You are playing' : 'Who are you playing?'}
      </Text>
      <View style={styles.chips}>
        {characters.map((c) => (
          <Chip key={c.name} label={c.name} detail={String(c.count)} selected={c.name === me} onPress={() => onChoose(c.name)} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});

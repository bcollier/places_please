import { StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LineDraft } from '@/hooks/use-line-draft';

/** "Spoken by": pick a character from the cast, or type a new name. */
export function SpeakerField({ characters, draft }: { characters: string[]; draft: LineDraft }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text variant="overline">Spoken by</Text>
      <View style={styles.chips}>
        {characters.map((c) => (
          <Chip key={c} label={c} selected={!draft.typingNewName && c === draft.character} onPress={() => draft.pickCharacter(c)} />
        ))}
      </View>
      <TextInput
        value={draft.newCharacter}
        onChangeText={draft.setNewCharacter}
        placeholder="…or type a new name"
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="characters"
        maxLength={80}
        style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
        accessibilityLabel="New character name"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three, fontSize: 17 },
});

import { useMemo } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { SpeakerField } from '@/components/line-editor/speaker-field';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import type { LineDraft } from '@/hooks/use-line-draft';
import { useLineEditActions } from '@/hooks/use-line-edit-actions';
import { useTheme } from '@/hooks/use-theme';
import { charactersByLineCount } from '@/lib/script-model';
import type { Script, ScriptLine } from '@/lib/types';

/** The line editor: speaker, text, and Save / Insert line after / Delete. */
export function EditLineForm({ script, line, draft }: { script: Script; line: ScriptLine; draft: LineDraft }) {
  const theme = useTheme();
  const characters = useMemo(() => charactersByLineCount(script.lines).map((c) => c.name), [script]);
  const { saving, save, insertAfter, remove } = useLineEditActions(script, line, draft);
  const isNewLine = line.text === '(new line)';

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <SpeakerField characters={characters} draft={draft} />

      <View style={styles.field}>
        <Text variant="overline">Line</Text>
        <TextInput
          value={draft.text}
          onChangeText={draft.setText}
          multiline
          autoFocus={isNewLine}
          selectTextOnFocus={isNewLine}
          style={[styles.input, styles.multiline, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
          accessibilityLabel="Line text"
        />
      </View>

      <Button title="Save" icon="checkmark" onPress={save} loading={saving} />
      <View style={styles.row}>
        <Button title="Insert line after" icon="plus" variant="secondary" size="medium" onPress={insertAfter} disabled={saving} style={styles.flex} />
        <Button title="Delete" icon="trash" variant="destructive" size="medium" onPress={() => void remove()} disabled={saving} style={styles.flex} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, gap: Spacing.five },
  field: { gap: Spacing.two },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three, fontSize: 17 },
  multiline: { minHeight: 140, textAlignVertical: 'top', fontSize: 18, lineHeight: 26 },
  row: { flexDirection: 'row', gap: Spacing.three },
  flex: { flex: 1 },
});

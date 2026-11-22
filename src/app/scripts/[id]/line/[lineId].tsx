import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { ErrorView } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction, showAlert } from '@/lib/dialogs';
import { toUserMessage } from '@/lib/errors';
import { goBack } from '@/lib/navigation';
import { charactersByLineCount, newLineId, uniqueCharacters } from '@/lib/script-model';
import { useData } from '@/providers/data-provider';

/** Fix a line the AI misread: edit text or speaker, delete it, or insert a missing line after it. */
export default function EditLineScreen() {
  const theme = useTheme();
  const { id, lineId } = useLocalSearchParams<{ id: string; lineId: string }>();
  const { getScript, saveScript } = useData();
  const script = getScript(id);
  const line = script?.lines.find((l) => l.id === lineId);

  const [text, setText] = useState(line?.text ?? '');
  const [character, setCharacter] = useState(line?.character ?? '');
  const [newCharacter, setNewCharacter] = useState('');
  const [saving, setSaving] = useState(false);

  const characters = useMemo(() => (script ? charactersByLineCount(script.lines).map((c) => c.name) : []), [script]);

  if (!script || !line) {
    return <ErrorView message="That line no longer exists." onRetry={goBack} retryLabel="Close" />;
  }

  const commit = async (lines: typeof script.lines) => {
    setSaving(true);
    try {
      const chars = uniqueCharacters(lines);
      await saveScript(script.id, {
        lines,
        characters: chars,
        ...(script.my_character && !chars.includes(script.my_character) ? { my_character: null } : {}),
      });
      goBack();
    } catch (err) {
      showAlert('Not saved', toUserMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const speaker = (newCharacter.trim() || character).toUpperCase();

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed) {
      showAlert('Line is empty', 'Type the line, or delete it instead.');
      return;
    }
    void commit(script.lines.map((l) => (l.id === line.id ? { ...l, text: trimmed, character: speaker } : l)));
  };

  const insertAfter = () => {
    const idx = script.lines.findIndex((l) => l.id === line.id);
    const inserted = { id: newLineId(), character: line.character, text: '(new line)', scene: line.scene };
    const lines = [...script.lines.slice(0, idx + 1), inserted, ...script.lines.slice(idx + 1)];
    setSaving(true);
    saveScript(script.id, { lines })
      .then(() => router.replace({ pathname: '/scripts/[id]/line/[lineId]', params: { id: script.id, lineId: inserted.id } }))
      .catch((err) => showAlert('Not saved', toUserMessage(err)))
      .finally(() => setSaving(false));
  };

  const remove = async () => {
    const ok = await confirmAction({ title: 'Delete this line?', confirmLabel: 'Delete', destructive: true });
    if (ok) await commit(script.lines.filter((l) => l.id !== line.id));
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <View style={styles.field}>
        <Text variant="overline">Spoken by</Text>
        <View style={styles.chips}>
          {characters.map((c) => (
            <Chip
              key={c}
              label={c}
              selected={!newCharacter.trim() && c === character}
              onPress={() => {
                setNewCharacter('');
                setCharacter(c);
              }}
            />
          ))}
        </View>
        <TextInput
          value={newCharacter}
          onChangeText={setNewCharacter}
          placeholder="…or type a new name"
          placeholderTextColor={theme.textTertiary}
          autoCapitalize="characters"
          maxLength={80}
          style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
          accessibilityLabel="New character name"
        />
      </View>

      <View style={styles.field}>
        <Text variant="overline">Line</Text>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          autoFocus={line.text === '(new line)'}
          selectTextOnFocus={line.text === '(new line)'}
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
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three, fontSize: 17 },
  multiline: { minHeight: 140, textAlignVertical: 'top', fontSize: 18, lineHeight: 26 },
  row: { flexDirection: 'row', gap: Spacing.three },
  flex: { flex: 1 },
});

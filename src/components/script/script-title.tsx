import { useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { showAlert } from '@/lib/dialogs';
import { toUserMessage } from '@/lib/errors';
import type { Script } from '@/lib/types';
import { useData } from '@/providers/data-provider';

/** The script's title; tap it to rename. */
export function ScriptTitle({ script }: { script: Script }) {
  const theme = useTheme();
  const { saveScript } = useData();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(script.title);

  const startEditing = () => {
    setDraft(script.title);
    setEditing(true);
  };

  const saveTitle = async () => {
    const next = draft.trim();
    setEditing(false);
    if (!next || next === script.title) return;
    try {
      await saveScript(script.id, { title: next });
    } catch (err) {
      showAlert('Not saved', toUserMessage(err));
    }
  };

  if (editing) {
    return (
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={saveTitle}
        onSubmitEditing={saveTitle}
        autoFocus
        maxLength={200}
        returnKeyType="done"
        style={[styles.titleInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
        accessibilityLabel="Script title"
      />
    );
  }

  return (
    <Pressable onPress={startEditing} accessibilityRole="button" accessibilityHint="Rename script">
      <Text variant="display" style={styles.title}>
        {script.title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 30, lineHeight: 36 },
  titleInput: { fontSize: 24, fontWeight: '600', borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three },
});

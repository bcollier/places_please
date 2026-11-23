import { StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ImportResult } from '@/lib/script-import';
import { charactersByLineCount } from '@/lib/script-model';
import type { ScriptLine } from '@/lib/types';

const PREVIEW_LINES = 6;

type CharacterCount = ReturnType<typeof charactersByLineCount>[number];

type ReviewStepProps = {
  result: ImportResult;
  title: string;
  setTitle: (t: string) => void;
  character: string | null;
  setCharacter: (c: string) => void;
  saving: boolean;
  onSave: () => void;
  onStartOver: () => void;
};

/** What the import found: name the script, pick your character, glance at the first lines, save. */
export function ReviewStep({ result, title, setTitle, character, setCharacter, saving, onSave, onStartOver }: ReviewStepProps) {
  const counts = charactersByLineCount(result.lines);
  return (
    <>
      <FoundSummary lineCount={result.lines.length} characterCount={counts.length} />
      <TitleField title={title} setTitle={setTitle} />
      <CharacterPicker counts={counts} character={character} setCharacter={setCharacter} />
      <LinePreview lines={result.lines} character={character} />
      <Button title={character ? 'Save script' : 'Choose your character to save'} icon="checkmark" disabled={!character} loading={saving} onPress={onSave} />
      <Button title="Start over" variant="ghost" size="medium" onPress={onStartOver} disabled={saving} />
    </>
  );
}

function FoundSummary({ lineCount, characterCount }: { lineCount: number; characterCount: number }) {
  const theme = useTheme();
  return (
    <Card style={styles.reviewHeader}>
      <Icon name="checkmark.circle.fill" size={24} color={theme.perfect} />
      <Text variant="callout" style={styles.flex}>
        Found {lineCount} lines for {characterCount} character{characterCount === 1 ? '' : 's'}. You can fix any line
        later from the script page.
      </Text>
    </Card>
  );
}

function TitleField({ title, setTitle }: { title: string; setTitle: (t: string) => void }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text variant="overline">Title</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Script title"
        placeholderTextColor={theme.textTertiary}
        maxLength={200}
        returnKeyType="done"
        style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
        accessibilityLabel="Script title"
      />
    </View>
  );
}

function CharacterPicker({
  counts,
  character,
  setCharacter,
}: {
  counts: CharacterCount[];
  character: string | null;
  setCharacter: (c: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text variant="overline">Who are you playing?</Text>
      <View style={styles.chips}>
        {counts.map((c) => (
          <Chip
            key={c.name}
            label={c.name}
            detail={String(c.count)}
            selected={character === c.name}
            onPress={() => setCharacter(c.name)}
          />
        ))}
      </View>
    </View>
  );
}

/** The first few lines, with the chosen character's names highlighted. */
function LinePreview({ lines, character }: { lines: ScriptLine[]; character: string | null }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text variant="overline">Preview</Text>
      <Card style={styles.preview}>
        {lines.slice(0, PREVIEW_LINES).map((l) => (
          <View key={l.id} style={styles.previewLine}>
            <Text variant="caption" style={{ fontWeight: '700', color: l.character === character ? theme.primary : theme.textSecondary }}>
              {l.character}
            </Text>
            <Text variant="callout" numberOfLines={2}>
              {l.text}
            </Text>
          </View>
        ))}
        {lines.length > PREVIEW_LINES ? (
          <Text variant="caption">…and {lines.length - PREVIEW_LINES} more</Text>
        ) : null}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  field: { gap: Spacing.two },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three, fontSize: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  preview: { gap: Spacing.three },
  previewLine: { gap: 2 },
});

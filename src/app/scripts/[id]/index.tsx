import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { ErrorView } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { confirmAction, showAlert } from '@/lib/dialogs';
import { toUserMessage } from '@/lib/errors';
import { goBack } from '@/lib/navigation';
import { warmupAvailable } from '@/lib/rehearsal/warmup';
import { charactersByLineCount, linesInScene, scenesWithCharacter } from '@/lib/script-model';
import { Cancellation } from '@/lib/audio/cancel';
import { castVoices, speak, stopSpeaking } from '@/lib/audio/tts';
import { Icon } from '@/components/ui/icon';
import type { Gender, Script, ScriptLine } from '@/lib/types';
import { useGenderGuess } from '@/hooks/use-gender-guess';
import { useData } from '@/providers/data-provider';

export default function ScriptScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { id, pick } = useLocalSearchParams<{ id: string; pick?: string }>();
  const { getScript, saveScript, removeScript, setCurrentScript } = useData();
  const script = getScript(id);
  useGenderGuess(script);

  const [scene, setScene] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(script?.title ?? '');
  const [busy, setBusy] = useState(false);

  const characters = useMemo(() => (script ? charactersByLineCount(script.lines) : []), [script]);
  const scenes = useMemo(
    () => (script?.my_character ? scenesWithCharacter(script.lines, script.my_character) : []),
    [script],
  );
  const visibleLines = useMemo(() => (script ? linesInScene(script.lines, scene) : []), [script, scene]);

  if (!script) {
    return <ErrorView message="This script couldn't be found. It may have been deleted." onRetry={goBack} retryLabel="Go back" />;
  }

  const me = script.my_character;
  const needsCharacter = !me || pick === '1';

  const chooseCharacter = async (name: string) => {
    if (name === me) return;
    try {
      await saveScript(script.id, { my_character: name });
      setScene(null);
      setCurrentScript(script.id);
    } catch (err) {
      showAlert('Not saved', toUserMessage(err));
    }
  };

  const saveTitle = async () => {
    const next = titleDraft.trim();
    setEditingTitle(false);
    if (!next || next === script.title) return;
    try {
      await saveScript(script.id, { title: next });
    } catch (err) {
      showAlert('Not saved', toUserMessage(err));
    }
  };

  const confirmDelete = async () => {
    const ok = await confirmAction({
      title: 'Delete this script?',
      message: `“${script.title}” and its practice history will be removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeScript(script.id);
      goBack();
    } catch (err) {
      setBusy(false);
      showAlert('Not deleted', toUserMessage(err));
    }
  };

  const go = (mode: 'run' | 'warmup' | 'listen') => {
    setCurrentScript(script.id);
    const params = { id: script.id, ...(scene ? { scene } : {}) };
    if (mode === 'run') router.push({ pathname: '/scripts/[id]/run', params });
    else if (mode === 'warmup') router.push({ pathname: '/scripts/[id]/warmup', params });
    else router.push({ pathname: '/scripts/[id]/listen', params });
  };

  const myLinesInView = me ? visibleLines.filter((l) => l.character === me).length : 0;

  const header = (
    <View style={styles.header}>
      {editingTitle ? (
        <TextInput
          value={titleDraft}
          onChangeText={setTitleDraft}
          onBlur={saveTitle}
          onSubmitEditing={saveTitle}
          autoFocus
          maxLength={200}
          returnKeyType="done"
          style={[styles.titleInput, { color: theme.text, borderColor: theme.border, backgroundColor: theme.surface }]}
          accessibilityLabel="Script title"
        />
      ) : (
        <Pressable
          onPress={() => {
            setTitleDraft(script.title);
            setEditingTitle(true);
          }}
          accessibilityRole="button"
          accessibilityHint="Rename script">
          <Text variant="display" style={styles.title}>
            {script.title}
          </Text>
        </Pressable>
      )}

      <View style={styles.section}>
        <Text variant="overline" color={needsCharacter && !me ? 'primary' : 'textSecondary'}>
          {me ? 'You are playing' : 'Who are you playing?'}
        </Text>
        <View style={styles.chips}>
          {characters.map((c) => (
            <Chip key={c.name} label={c.name} detail={String(c.count)} selected={c.name === me} onPress={() => chooseCharacter(c.name)} />
          ))}
        </View>
      </View>

      {me && scenes.length > 1 ? (
        <View style={styles.section}>
          <Text variant="overline">Practice</Text>
          <View style={styles.chips}>
            <Chip label="Whole script" selected={scene === null} onPress={() => setScene(null)} />
            {scenes.map((s) => (
              <Chip key={s} label={s} selected={scene === s} onPress={() => setScene(s)} />
            ))}
          </View>
        </View>
      ) : null}

      {me ? (
        <View style={styles.modes}>
          <Button title="Run Lines" icon="mic.fill" onPress={() => go('run')} disabled={myLinesInView === 0} />
          <View style={styles.row}>
            <Button
              title="Warm Up"
              icon="rectangle.on.rectangle.angled"
              variant="secondary"
              size="medium"
              style={styles.flex}
              disabled={!warmupAvailable(visibleLines, me)}
              onPress={() => go('warmup')}
            />
            <Button title="Listen" icon="headphones" variant="secondary" size="medium" style={styles.flex} onPress={() => go('listen')} />
          </View>
        </View>
      ) : (
        <Card style={{ backgroundColor: theme.primarySoft, borderColor: theme.primarySoft }}>
          <Text variant="callout">Choose your character above to start practicing.</Text>
        </Card>
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

  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <FlatList
        data={visibleLines}
        keyExtractor={(l) => l.id}
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.seven }]}
        contentInsetAdjustmentBehavior="automatic"
        ListHeaderComponent={header}
        renderItem={({ item, index }) => (
          <LineRow
            line={item}
            mine={item.character === me}
            showScene={!scene && item.scene !== null && item.scene !== visibleLines[index - 1]?.scene}
            onPress={() => router.push({ pathname: '/scripts/[id]/line/[lineId]', params: { id: script.id, lineId: item.id } })}
          />
        )}
        ListFooterComponent={
          <Button title="Delete script" icon="trash" variant="destructive" size="medium" onPress={() => void confirmDelete()} loading={busy} style={styles.delete} />
        }
      />
    </>
  );
}

/** Voice casting: choose a woman's or man's voice per character, and hear it. */
function VoicesSection({ script }: { script: Script }) {
  const theme = useTheme();
  const { saveScript, settings } = useData();
  const [open, setOpen] = useState(false);
  const characters = charactersByLineCount(script.lines).map((c) => c.name);
  const genders = script.character_genders;

  const setGender = async (name: string, gender: Gender) => {
    try {
      await saveScript(script.id, { character_genders: { ...genders, [name]: gender } });
    } catch (err) {
      showAlert('Not saved', toUserMessage(err));
    }
  };

  const preview = async (name: string) => {
    stopSpeaking();
    const cast = await castVoices({ characters, me: script.my_character, genders, engine: settings.voiceEngine });
    const line = script.lines.find((l) => l.character === name)?.text ?? `Hello, I'm ${name}.`;
    await speak(line.slice(0, 160), cast.forCharacter(name), settings.speechRate, new Cancellation()).catch(() => {});
  };

  return (
    <View style={styles.section}>
      <Pressable
        onPress={() => setOpen((o) => !o)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.voicesHeader}>
        <Text variant="overline">Voices</Text>
        <Text variant="caption" color="primary">
          {open ? 'Done' : 'Change'}
        </Text>
      </Pressable>
      {open ? (
        <Card style={styles.voicesCard}>
          {characters.map((name) => (
            <View key={name} style={styles.voiceRow}>
              <Text variant="callout" style={[styles.flex, { fontWeight: '600' }]} numberOfLines={1}>
                {name}
                {name === script.my_character ? <Text variant="caption"> (you)</Text> : null}
              </Text>
              <Chip label="Woman" selected={genders[name] === 'female'} onPress={() => void setGender(name, 'female')} />
              <Chip label="Man" selected={genders[name] === 'male'} onPress={() => void setGender(name, 'male')} />
              <Pressable
                onPress={() => void preview(name)}
                accessibilityRole="button"
                accessibilityLabel={`Hear ${name}'s voice`}
                hitSlop={8}
                style={styles.previewButton}>
                <Icon name="speaker.wave.2.fill" size={18} color={theme.primary} />
              </Pressable>
            </View>
          ))}
        </Card>
      ) : (
        <Text variant="caption">
          {characters
            .slice(0, 6)
            .map((n) => `${n} ${genders[n] === 'female' ? '(woman)' : genders[n] === 'male' ? '(man)' : '(?)'}`)
            .join(' · ')}
          {characters.length > 6 ? ' …' : ''}
        </Text>
      )}
    </View>
  );
}

function LineRow({ line, mine, showScene, onPress }: { line: ScriptLine; mine: boolean; showScene: boolean; onPress: () => void }) {
  const theme = useTheme();
  return (
    <View style={styles.lineWrap}>
      {showScene ? (
        <Text variant="overline" color="primary" style={styles.scene}>
          {line.scene}
        </Text>
      ) : null}
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${line.character}: ${line.text}`}
        accessibilityHint="Edit this line"
        style={({ pressed }) => [
          styles.line,
          mine && { backgroundColor: theme.primarySoft, borderLeftColor: theme.primary },
          !mine && { borderLeftColor: 'transparent' },
          pressed && { opacity: 0.6 },
        ]}>
        <Text variant="caption" style={{ fontWeight: '700', color: mine ? theme.primary : theme.textSecondary, letterSpacing: 0.6 }}>
          {line.character}
        </Text>
        <Text variant="body" style={styles.lineText}>
          {line.text}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.four, width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  header: { gap: Spacing.five, paddingTop: Spacing.two, paddingBottom: Spacing.three },
  title: { fontSize: 30, lineHeight: 36 },
  titleInput: { fontSize: 24, fontWeight: '600', borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three },
  section: { gap: Spacing.two },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  modes: { gap: Spacing.three },
  row: { flexDirection: 'row', gap: Spacing.three },
  flex: { flex: 1 },
  linesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: Spacing.two },
  lineWrap: { gap: Spacing.two },
  scene: { marginTop: Spacing.four },
  line: {
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.small,
    borderLeftWidth: 3,
    gap: 2,
    marginBottom: Spacing.one,
  },
  lineText: { fontSize: 16, lineHeight: 23 },
  delete: { marginTop: Spacing.six },
  voicesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  voicesCard: { gap: Spacing.three },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  previewButton: { padding: Spacing.one },
});

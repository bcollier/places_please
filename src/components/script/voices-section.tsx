import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { Cancellation } from '@/lib/audio/cancel';
import { castVoices, speak, stopSpeaking } from '@/lib/audio/tts';
import { showAlert } from '@/lib/dialogs';
import { toUserMessage } from '@/lib/errors';
import { charactersByLineCount } from '@/lib/script-model';
import type { Gender, Script } from '@/lib/types';
import { useData } from '@/providers/data-provider';

const SUMMARY_LIMIT = 6;

/** Voice casting: choose a woman's or man's voice per character, and hear it. */
export function VoicesSection({ script }: { script: Script }) {
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
            <VoiceRow
              key={name}
              name={name}
              isMe={name === script.my_character}
              gender={genders[name]}
              onSetGender={(gender) => void setGender(name, gender)}
              onPreview={() => void preview(name)}
            />
          ))}
        </Card>
      ) : (
        <Text variant="caption">{castingSummary(characters, genders)}</Text>
      )}
    </View>
  );
}

function VoiceRow({
  name,
  isMe,
  gender,
  onSetGender,
  onPreview,
}: {
  name: string;
  isMe: boolean;
  gender: Gender | undefined;
  onSetGender: (gender: Gender) => void;
  onPreview: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.voiceRow}>
      <Text variant="callout" style={[styles.flex, { fontWeight: '600' }]} numberOfLines={1}>
        {name}
        {isMe ? <Text variant="caption"> (you)</Text> : null}
      </Text>
      <Chip label="Woman" selected={gender === 'female'} onPress={() => onSetGender('female')} />
      <Chip label="Man" selected={gender === 'male'} onPress={() => onSetGender('male')} />
      <Pressable
        onPress={onPreview}
        accessibilityRole="button"
        accessibilityLabel={`Hear ${name}'s voice`}
        hitSlop={8}
        style={styles.previewButton}>
        <Icon name="speaker.wave.2.fill" size={18} color={theme.primary} />
      </Pressable>
    </View>
  );
}

/** e.g. "HAMLET (man) · OPHELIA (woman) · GHOST (?) …" for the first few characters. */
function castingSummary(characters: string[], genders: Record<string, Gender>) {
  const shown = characters
    .slice(0, SUMMARY_LIMIT)
    .map((n) => `${n} ${genders[n] === 'female' ? '(woman)' : genders[n] === 'male' ? '(man)' : '(?)'}`)
    .join(' · ');
  return shown + (characters.length > SUMMARY_LIMIT ? ' …' : '');
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  flex: { flex: 1 },
  voicesHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  voicesCard: { gap: Spacing.three },
  voiceRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  previewButton: { padding: Spacing.one },
});

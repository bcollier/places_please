import { Platform, StyleSheet, View } from 'react-native';

import { SettingsSection } from '@/components/settings/settings-section';
import { Button } from '@/components/ui/button';
import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useDeviceVoiceCount } from '@/hooks/use-device-voice-count';
import { Cancellation } from '@/lib/audio/cancel';
import { castVoices, speak, stopSpeaking } from '@/lib/audio/tts';
import type { Settings } from '@/lib/types';

const RATES: { label: string; value: number }[] = [
  { label: 'Slower', value: 0.8 },
  { label: 'Normal', value: 1 },
  { label: 'Faster', value: 1.2 },
];

const SAMPLE_LINES = {
  female: 'Places, please. Act one beginners, this is your call.',
  male: 'Good my lord, how does your honour for this many a day?',
};

/** "Scene partner voices": voice engine, speaking rate, and voice samples. */
export function VoiceSection({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const voiceCount = useDeviceVoiceCount();
  return (
    <SettingsSection
      title="Scene partner voices"
      subtitle={
        Platform.OS === 'web'
          ? 'ElevenLabs voices sound natural and need an internet connection. Browser voices work offline.'
          : 'ElevenLabs voices sound natural and need an internet connection. iPhone voices work offline.'
      }>
      <View style={styles.chips}>
        <Chip label="ElevenLabs" detail="Natural" selected={settings.voiceEngine === 'elevenlabs'} onPress={() => onChange({ voiceEngine: 'elevenlabs' })} />
        <Chip label="iPhone" detail="Offline" selected={settings.voiceEngine === 'device'} onPress={() => onChange({ voiceEngine: 'device' })} />
      </View>
      <View style={styles.chips}>
        {RATES.map((r) => (
          <Chip key={r.value} label={r.label} selected={settings.speechRate === r.value} onPress={() => onChange({ speechRate: r.value })} />
        ))}
      </View>
      <View style={styles.chips}>
        <Button title="Hear a woman" icon="speaker.wave.2.fill" variant="ghost" size="small" onPress={() => void playVoiceSample('female', settings)} />
        <Button title="Hear a man" icon="speaker.wave.2.fill" variant="ghost" size="small" onPress={() => void playVoiceSample('male', settings)} />
      </View>
      {settings.voiceEngine === 'device' && voiceCount !== null && voiceCount < 3 ? (
        <Text variant="caption">
          Tip: for better iPhone voices, download Enhanced or Premium voices in iOS Settings › Accessibility › Spoken Content › Voices.
        </Text>
      ) : null}
    </SettingsSection>
  );
}

async function playVoiceSample(gender: 'female' | 'male', settings: Settings) {
  stopSpeaking();
  const cast = await castVoices({
    characters: ['SAMPLE'],
    me: null,
    genders: { SAMPLE: gender },
    engine: settings.voiceEngine,
  });
  await speak(SAMPLE_LINES[gender], cast.forCharacter('SAMPLE'), settings.speechRate, new Cancellation()).catch(() => {});
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});

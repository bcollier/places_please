import { ScrollView, StyleSheet, View } from 'react-native';

import { AccountSection } from '@/components/settings/account-section';
import { AiUsageSection } from '@/components/settings/ai-usage-section';
import { AfterMistakeSection, ListenSection, PauseLengthSection, RunLinesSection } from '@/components/settings/practice-settings-sections';
import { SoundCheckSection } from '@/components/settings/sound-check-section';
import { VoiceSection } from '@/components/settings/voice-section';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { showAlert } from '@/lib/dialogs';
import { toUserMessage } from '@/lib/errors';
import type { Settings } from '@/lib/types';
import { useData } from '@/providers/data-provider';

export default function SettingsScreen() {
  const theme = useTheme();
  const { settings, updateSettings } = useData();

  const set = (patch: Partial<Settings>) => {
    updateSettings(patch).catch((err) => showAlert('Not saved', toUserMessage(err)));
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} contentInsetAdjustmentBehavior="automatic">
      <View style={styles.inner}>
        <AccountSection />
        <VoiceSection settings={settings} onChange={set} />
        <PauseLengthSection settings={settings} onChange={set} />
        <AfterMistakeSection settings={settings} onChange={set} />
        <RunLinesSection settings={settings} onChange={set} />
        <ListenSection settings={settings} onChange={set} />
        <SoundCheckSection />
        <AiUsageSection />

        <Text variant="caption" style={styles.footer}>
          Places, Please · Recordings of your lines are sent for checking and deleted from your phone right away; they are never stored.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.five },
  footer: { textAlign: 'center', marginTop: Spacing.four },
});

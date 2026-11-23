import { StyleSheet, View } from 'react-native';

import { SettingsSection } from '@/components/settings/settings-section';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useSoundCheck } from '@/hooks/use-sound-check';
import { useTheme } from '@/hooks/use-theme';
import type { CheckStep } from '@/lib/audio/sound-check';

export function SoundCheckSection() {
  const { steps, checking, run } = useSoundCheck();
  return (
    <SettingsSection title="Sound check" subtitle="Hearing nothing? This plays each kind of sound the app uses and shows what happened.">
      <Button title={checking ? 'Checking…' : 'Run sound check'} icon="speaker.wave.2.fill" variant="secondary" size="medium" loading={checking} onPress={() => void run()} />
      {steps.map((step) => (
        <CheckStepRow key={step.label} step={step} />
      ))}
    </SettingsSection>
  );
}

/** One sound-check step: a clock while it runs, then a tick or a cross. */
function CheckStepRow({ step }: { step: CheckStep }) {
  const theme = useTheme();
  return (
    <View style={styles.checkRow}>
      <Icon
        name={step.ok === null ? 'clock' : step.ok ? 'checkmark.circle.fill' : 'xmark.circle.fill'}
        size={18}
        color={step.ok === null ? theme.textSecondary : step.ok ? theme.perfect : theme.miss}
      />
      <View style={styles.flex}>
        <Text variant="bodyStrong">{step.label}</Text>
        <Text variant="caption">{step.detail}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  checkRow: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  flex: { flex: 1 },
});

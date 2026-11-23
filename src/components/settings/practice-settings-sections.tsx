import { StyleSheet, View } from 'react-native';

import { SettingsSection } from '@/components/settings/settings-section';
import { ToggleRow } from '@/components/settings/toggle-row';
import { Chip } from '@/components/ui/chip';
import { Spacing } from '@/constants/theme';
import type { PauseLength, PauseOnMistake, Settings } from '@/lib/types';

type SectionProps = { settings: Settings; onChange: (patch: Partial<Settings>) => void };

const PAUSES: { label: string; value: PauseLength; detail: string }[] = [
  { label: 'Short', value: 'short', detail: 'Snappy dialogue' },
  { label: 'Medium', value: 'medium', detail: 'Most scenes' },
  { label: 'Long', value: 'long', detail: 'Dramatic pauses' },
];

const MISTAKE_OPTIONS: { label: string; value: PauseOnMistake; detail: string }[] = [
  { label: 'Stop', value: 'all', detail: 'After any mistake' },
  { label: 'Stop', value: 'missed', detail: 'Only after a missed line' },
  { label: 'Keep going', value: 'never', detail: 'Hands-free, screen off' },
];

export function PauseLengthSection({ settings, onChange }: SectionProps) {
  return (
    <SettingsSection title="When I've finished my line" subtitle="How long a silence means you're done speaking in Run Lines.">
      <View style={styles.chips}>
        {PAUSES.map((p) => (
          <Chip key={p.value} label={p.label} detail={p.detail} selected={settings.pauseLength === p.value} onPress={() => onChange({ pauseLength: p.value })} />
        ))}
      </View>
    </SettingsSection>
  );
}

export function AfterMistakeSection({ settings, onChange }: SectionProps) {
  return (
    <SettingsSection
      title="After a mistake"
      subtitle="Stop so you can see what you said, then Try again or Keep going. Choose Keep going for hands-free practice with the screen off.">
      <View style={styles.chips}>
        {MISTAKE_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            label={o.label}
            detail={o.detail}
            selected={settings.pauseOnMistake === o.value}
            onPress={() => onChange({ pauseOnMistake: o.value })}
          />
        ))}
      </View>
    </SettingsSection>
  );
}

export function RunLinesSection({ settings, onChange }: SectionProps) {
  return (
    <SettingsSection title="Run Lines">
      <ToggleRow label="Read the line to me after a miss" value={settings.promptOnMiss} onChange={(v) => onChange({ promptOnMiss: v })} />
      <ToggleRow label="Play a tick when it's my turn" value={settings.cueSound} onChange={(v) => onChange({ cueSound: v })} />
    </SettingsSection>
  );
}

export function ListenSection({ settings, onChange }: SectionProps) {
  return (
    <SettingsSection title="Listen">
      <ToggleRow
        label="Read my lines aloud too"
        detail="Off leaves a pause so you can say them."
        value={settings.listenReadsMyLines}
        onChange={(v) => onChange({ listenReadsMyLines: v })}
      />
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
});

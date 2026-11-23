import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';

import { Chip } from '@/components/ui/chip';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ListenPlayer } from '@/lib/rehearsal/listen-player';
import { useData } from '@/providers/data-provider';

const SPEEDS = [0.8, 1, 1.2] as const;

/**
 * Playback speed and "Read my lines" for this Listen session. Both apply from the next line; only
 * "Read my lines" is remembered in settings.
 */
export function ListenOptions({ player, me }: { player: ListenPlayer; me: string | null }) {
  const theme = useTheme();
  const { settings, updateSettings } = useData();
  const [readsMine, setReadsMine] = useState(settings.listenReadsMyLines);
  const [rate, setRate] = useState(settings.speechRate);

  const toggleReadsMine = (value: boolean) => {
    setReadsMine(value);
    player.updateSettings({ listenReadsMyLines: value });
    void updateSettings({ listenReadsMyLines: value }).catch(() => {});
  };

  const changeRate = (value: number) => {
    setRate(value);
    player.updateSettings({ speechRate: value });
  };

  return (
    <View style={styles.optionsRow}>
      <View style={styles.speeds}>
        {SPEEDS.map((s) => (
          <Chip key={s} label={`${s}×`} selected={rate === s} onPress={() => changeRate(s)} />
        ))}
      </View>
      {me ? (
        <View style={styles.switchRow}>
          <Text variant="caption">Read my lines</Text>
          <Switch
            value={readsMine}
            onValueChange={toggleReadsMine}
            trackColor={{ true: theme.primary }}
            accessibilityLabel="Read my lines aloud. Off leaves a pause for you to say them."
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  optionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three, flexWrap: 'wrap' },
  speeds: { flexDirection: 'row', gap: Spacing.two },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});

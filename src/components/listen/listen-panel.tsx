import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListenOptions } from '@/components/listen/listen-options';
import { RoundButton } from '@/components/listen/round-button';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { ListenPlayer, ListenState } from '@/lib/rehearsal/listen-player';

/** The bottom panel in Listen: status message, transport buttons and playback options. */
export function ListenPanel({ player, state, me }: { player: ListenPlayer; state: ListenState; me: string | null }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const playing = state.phase === 'playing';

  return (
    <View style={[styles.panel, { borderTopColor: theme.border, backgroundColor: theme.background, paddingBottom: insets.bottom + Spacing.three }]}>
      {state.phase === 'error' ? (
        <Text variant="caption" color="miss">
          {state.error}
        </Text>
      ) : null}
      {state.phase === 'finished' ? (
        <Text variant="callout" color="textSecondary" style={styles.center}>
          That’s the end of the scene.
        </Text>
      ) : null}

      <View style={styles.transport}>
        <RoundButton icon="backward.fill" label="Previous line" onPress={() => player.skip(-1)} />
        <RoundButton
          icon={playing ? 'pause.fill' : 'play.fill'}
          label={playing ? 'Pause' : 'Play'}
          large
          onPress={() => (playing ? player.pause() : void player.play())}
        />
        <RoundButton icon="forward.fill" label="Next line" onPress={() => player.skip(1)} />
      </View>

      <ListenOptions player={player} me={me} />
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing.four, paddingHorizontal: Spacing.four, gap: Spacing.four },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.six },
  center: { textAlign: 'center' },
});

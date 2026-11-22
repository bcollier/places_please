import { useEffect, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const BARS = 9;
// Middle bars move the most, like a voice waveform.
const SHAPE = [0.35, 0.55, 0.75, 0.9, 1, 0.9, 0.75, 0.55, 0.35];
const useNative = Platform.OS !== 'web';

type Mode = 'listening' | 'speaking' | 'idle';

/**
 * Animated bars. While listening they follow the live microphone level; while the scene partner
 * speaks they pulse on their own; otherwise they rest.
 */
export function VoiceMeter({ mode, level, height = 64 }: { mode: Mode; level: number; height?: number }) {
  const theme = useTheme();
  const [bars] = useState(() => Array.from({ length: BARS }, () => new Animated.Value(0.12)));

  // Listening: follow the mic level, with a little per-bar variation so it looks alive.
  useEffect(() => {
    if (mode !== 'listening') return;
    const loud = Math.max(0.08, level);
    const animations = bars.map((bar, i) =>
      Animated.timing(bar, {
        toValue: Math.min(1, 0.1 + loud * SHAPE[i] * (0.75 + Math.random() * 0.5)),
        duration: 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: useNative,
      }),
    );
    Animated.parallel(animations).start();
  }, [mode, level, bars]);

  // Partner speaking: a gentle looping wave. Idle: settle down.
  useEffect(() => {
    if (mode === 'listening') return;
    if (mode === 'idle') {
      Animated.parallel(
        bars.map((bar) => Animated.timing(bar, { toValue: 0.12, duration: 250, useNativeDriver: useNative })),
      ).start();
      return;
    }
    const loops = bars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 70),
          Animated.timing(bar, {
            toValue: 0.25 + SHAPE[i] * 0.45,
            duration: 380,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: useNative,
          }),
          Animated.timing(bar, {
            toValue: 0.15,
            duration: 380,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: useNative,
          }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [mode, bars]);

  const color = mode === 'listening' ? theme.primary : mode === 'speaking' ? theme.textSecondary : theme.border;

  return (
    <View
      style={[styles.row, { height }]}
      accessibilityRole="image"
      accessibilityLabel={mode === 'listening' ? 'Listening to you' : mode === 'speaking' ? 'Scene partner speaking' : 'Waiting'}>
      {bars.map((bar, i) => (
        <Animated.View
          key={i}
          style={[styles.bar, { height, backgroundColor: color, transform: [{ scaleY: bar }] }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  bar: { width: 7, borderRadius: 4 },
});

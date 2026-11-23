import { Pressable } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { useTheme } from '@/hooks/use-theme';

type IconName = Parameters<typeof Icon>[0]['name'];

/** Circular transport button; `large` is the filled primary Play/Pause button. */
export function RoundButton({ icon, label, onPress, large }: { icon: IconName; label: string; onPress: () => void; large?: boolean }) {
  const theme = useTheme();
  const size = large ? 72 : 52;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: large ? theme.primary : theme.surface,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <Icon name={icon} size={large ? 28 : 20} color={large ? theme.onPrimary : theme.text} />
    </Pressable>
  );
}

import * as Haptics from 'expo-haptics';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function Chip({ label, selected, onPress, detail }: { label: string; selected: boolean; onPress: () => void; detail?: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => {});
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? theme.primary : theme.surface,
          borderColor: selected ? theme.primary : theme.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <Text variant="callout" style={{ color: selected ? theme.onPrimary : theme.text, fontWeight: '600' }}>
        {label}
        {detail ? (
          <Text variant="callout" style={{ color: selected ? theme.onPrimary : theme.textSecondary, fontWeight: '400' }}>
            {`  ${detail}`}
          </Text>
        ) : null}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
});

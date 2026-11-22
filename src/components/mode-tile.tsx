import { Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type ModeTileProps = {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  description: string;
  onPress: () => void;
  emphasis?: boolean;
  disabled?: boolean;
};

export function ModeTile({ icon, title, description, onPress, emphasis, disabled }: ModeTileProps) {
  const theme = useTheme();
  const bg = emphasis ? theme.primary : theme.surfaceRaised;
  const fg = emphasis ? theme.onPrimary : theme.text;
  const sub = emphasis ? 'rgba(255,255,255,0.85)' : theme.textSecondary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${description}`}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        {
          backgroundColor: bg,
          borderColor: emphasis ? theme.primary : theme.border,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.985 : 1 }],
        },
      ]}>
      <View style={[styles.iconWrap, { backgroundColor: emphasis ? 'rgba(255,255,255,0.18)' : theme.primarySoft }]}>
        <Icon name={icon} size={22} color={emphasis ? theme.onPrimary : theme.primary} />
      </View>
      <View style={styles.textCol}>
        <Text variant="heading" style={{ color: fg }}>
          {title}
        </Text>
        <Text variant="callout" style={{ color: sub }}>
          {description}
        </Text>
      </View>
      <Icon name="chevron.right" size={14} color={sub} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
    padding: Spacing.four,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
    borderCurve: 'continuous',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, gap: 2 },
});

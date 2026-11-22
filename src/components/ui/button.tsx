import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'large' | 'medium' | 'small';

export type ButtonProps = Omit<PressableProps, 'style' | 'children'> & {
  title: string;
  variant?: Variant;
  size?: Size;
  icon?: Parameters<typeof Icon>[0]['name'];
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({
  title,
  variant = 'primary',
  size = 'large',
  icon,
  loading = false,
  disabled,
  onPress,
  style,
  ...rest
}: ButtonProps) {
  const theme = useTheme();
  const isDisabled = disabled || loading;

  const palette = {
    primary: { bg: theme.primary, bgPressed: theme.primaryPressed, fg: theme.onPrimary, border: 'transparent' },
    secondary: { bg: theme.surface, bgPressed: theme.border, fg: theme.text, border: theme.border },
    ghost: { bg: 'transparent', bgPressed: theme.surface, fg: theme.primary, border: 'transparent' },
    destructive: { bg: theme.missSoft, bgPressed: theme.border, fg: theme.miss, border: 'transparent' },
  }[variant];

  const height = size === 'large' ? 54 : size === 'medium' ? 44 : 34;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      accessibilityLabel={title}
      disabled={isDisabled}
      onPress={(e) => {
        void Haptics.selectionAsync().catch(() => {});
        onPress?.(e);
      }}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight: height,
          paddingHorizontal: size === 'small' ? Spacing.three : Spacing.five,
          backgroundColor: pressed ? palette.bgPressed : palette.bg,
          borderColor: palette.border,
          opacity: isDisabled && !loading ? 0.45 : 1,
        },
        style,
      ]}
      {...rest}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={size === 'small' ? 15 : 18} color={palette.fg} /> : null}
          <Text variant={size === 'small' ? 'callout' : 'bodyStrong'} style={{ color: palette.fg, fontWeight: '600' }}>
            {title}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});

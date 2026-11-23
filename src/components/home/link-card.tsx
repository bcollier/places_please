import { StyleSheet } from 'react-native';

import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type IconName = Parameters<typeof Icon>[0]['name'];

/** A full-width card that opens another screen: icon, heading and a chevron. */
export function LinkCard({
  icon,
  title,
  accessibilityLabel,
  onPress,
}: {
  icon: IconName;
  title: string;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={accessibilityLabel} style={styles.row}>
      <Icon name={icon} size={20} color={theme.primary} />
      <Text variant="heading" style={styles.flex}>
        {title}
      </Text>
      <Icon name="chevron.right" size={14} color={theme.textTertiary} />
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  flex: { flex: 1 },
});

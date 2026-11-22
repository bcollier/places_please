import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { LineVerdict } from '@/lib/types';

const LABELS: Record<LineVerdict, string> = {
  perfect: 'Word perfect',
  close: 'Close — a little off',
  missed: 'Missed',
  skipped: 'Not checked',
};

export function VerdictBadge({ verdict }: { verdict: LineVerdict }) {
  const theme = useTheme();
  const style = {
    perfect: { fg: theme.perfect, bg: theme.perfectSoft, icon: 'checkmark.circle.fill' as const },
    close: { fg: theme.close, bg: theme.closeSoft, icon: 'exclamationmark.circle.fill' as const },
    missed: { fg: theme.miss, bg: theme.missSoft, icon: 'xmark.circle.fill' as const },
    skipped: { fg: theme.textSecondary, bg: theme.surface, icon: 'exclamationmark.circle.fill' as const },
  }[verdict];
  return (
    <View style={[styles.badge, { backgroundColor: style.bg }]} accessibilityLabel={LABELS[verdict]}>
      <Icon name={style.icon} size={18} color={style.fg} />
      <Text variant="callout" style={{ color: style.fg, fontWeight: '700' }}>
        {LABELS[verdict]}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
});

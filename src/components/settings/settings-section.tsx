import { StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';

/** A titled group of settings inside a card. */
export function SettingsSection({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="overline">{title}</Text>
      {subtitle ? <Text variant="caption">{subtitle}</Text> : null}
      <Card style={styles.card}>{children}</Card>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: Spacing.two },
  card: { gap: Spacing.three },
});

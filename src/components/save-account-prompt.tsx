import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';
import { useData } from '@/providers/data-provider';

/** Offered to guests after a finished session: never a wall, and "Not now" sticks. */
export function SaveAccountPrompt() {
  const theme = useTheme();
  const { account } = useAuth();
  const { settings, updateSettings } = useData();
  if (!account.isGuest || settings.accountPromptDismissed) return null;
  return (
    <Card style={[styles.card, { backgroundColor: theme.primarySoft, borderColor: theme.primarySoft }]}>
      <Text variant="heading">Nice work. Want to keep this safe?</Text>
      <Text variant="callout" color="textSecondary">
        Sign in to save your scripts and progress across devices.
      </Text>
      <View style={styles.row}>
        <Button title="Not now" variant="ghost" size="small" onPress={() => void updateSettings({ accountPromptDismissed: true }).catch(() => {})} />
        <Button title="Save my scripts" size="small" onPress={() => router.push('/account')} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: Spacing.two, marginTop: Spacing.four },
  row: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing.two, marginTop: Spacing.two },
});

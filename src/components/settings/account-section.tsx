import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { SettingsSection } from '@/components/settings/settings-section';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';

/** Shows whether you're a guest or signed in, and opens the Account screen. */
export function AccountSection() {
  const theme = useTheme();
  const { account } = useAuth();
  return (
    <SettingsSection title="Account">
      <Card onPress={() => router.push('/account')} accessibilityLabel="Account" style={styles.accountRow}>
        <Icon
          name={account.isGuest ? 'person.fill' : 'checkmark.circle.fill'}
          size={22}
          color={account.isGuest ? theme.primary : theme.perfect}
        />
        <View style={styles.flex}>
          <Text variant="bodyStrong">{account.isGuest ? 'Guest' : (account.email ?? 'Signed in')}</Text>
          <Text variant="caption">
            {account.isGuest ? 'Sign in with email to save your scripts across devices' : 'Signed in with email'}
          </Text>
        </View>
        <Icon name="chevron.right" size={14} color={theme.textTertiary} />
      </Card>
    </SettingsSection>
  );
}

const styles = StyleSheet.create({
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, padding: 0, borderWidth: 0 },
  flex: { flex: 1 },
});

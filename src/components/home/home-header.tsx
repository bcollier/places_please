import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';

/** Today's date, the app title, and the sign-in and settings buttons. */
export function HomeHeader() {
  const theme = useTheme();
  const { account } = useAuth();
  const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <View style={styles.header}>
      <View style={styles.flex}>
        <Text variant="overline" color="primary">
          {today}
        </Text>
        <Text variant="display" accessibilityRole="header">
          Places, Please
        </Text>
      </View>
      {account.isGuest ? (
        <Button title="Sign in" size="small" variant="secondary" onPress={() => router.push('/account')} style={styles.signIn} />
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        hitSlop={12}
        onPress={() => router.push('/settings')}
        style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 }]}>
        <Icon name="gearshape" size={20} color={theme.textSecondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three },
  flex: { flex: 1 },
  signIn: { marginBottom: 4 },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
});

import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** The import screen's error banner; offers email sign-in when importing needs an account. */
export function ImportErrorCard({ message, needsSignIn }: { message: string; needsSignIn: boolean }) {
  const theme = useTheme();
  return (
    <Card style={[styles.errorCard, { backgroundColor: theme.missSoft, borderColor: theme.miss }]}>
      <Icon name="exclamationmark.circle.fill" size={20} color={theme.miss} />
      <View style={styles.flex}>
        <Text variant="callout" style={{ color: theme.text }}>
          {message}
        </Text>
        {needsSignIn ? (
          <Button
            title="Sign in with email"
            icon="envelope.fill"
            size="small"
            onPress={() => router.push('/account')}
            style={styles.signIn}
          />
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  errorCard: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  signIn: { alignSelf: 'flex-start', marginTop: Spacing.three },
});

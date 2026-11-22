import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function LoadingView({ message }: { message?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: theme.background }]}>
      <ActivityIndicator color={theme.primary} size="large" />
      {message ? (
        <Text variant="callout" color="textSecondary" style={styles.message}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

export function ErrorView({ message, onRetry, retryLabel = 'Try again' }: { message: string; onRetry?: () => void; retryLabel?: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.center, { backgroundColor: theme.background }]}>
      <Icon name="exclamationmark.circle.fill" size={40} color={theme.primary} />
      <Text variant="title" style={styles.title}>
        Hold, please
      </Text>
      <Text variant="body" color="textSecondary" style={styles.message}>
        {message}
      </Text>
      {onRetry ? <Button title={retryLabel} icon="arrow.clockwise" onPress={onRetry} style={styles.button} /> : null}
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
  children,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  message: string;
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: theme.primarySoft }]}>
        <Icon name={icon} size={30} color={theme.primary} />
      </View>
      <Text variant="title" style={styles.title}>
        {title}
      </Text>
      <Text variant="body" color="textSecondary" style={styles.message}>
        {message}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.six,
    gap: Spacing.three,
  },
  title: { textAlign: 'center', marginTop: Spacing.two },
  message: { textAlign: 'center', maxWidth: 420 },
  button: { marginTop: Spacing.four, alignSelf: 'stretch', maxWidth: 360, width: '100%' },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.six,
    paddingHorizontal: Spacing.four,
    gap: Spacing.two,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

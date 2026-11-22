import { Alert, Platform } from 'react-native';

/**
 * Alerts and confirmations that work everywhere. React Native's Alert does nothing in a browser,
 * so on web these fall back to the browser's own alert/confirm.
 */

export function showAlert(title: string, message?: string, onDismiss?: () => void) {
  if (Platform.OS === 'web') {
    globalThis.alert?.(message ? `${title}\n\n${message}` : title);
    onDismiss?.();
    return;
  }
  Alert.alert(title, message, [{ text: 'OK', onPress: onDismiss }], { onDismiss });
}

export function confirmAction(options: {
  title: string;
  message?: string;
  confirmLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  const { title, message, confirmLabel, destructive } = options;
  if (Platform.OS === 'web') {
    return Promise.resolve(globalThis.confirm?.(message ? `${title}\n\n${message}` : title) ?? false);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}

import { StyleSheet, TextInput } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Text } from '@/components/ui/text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type EmailEntryCardProps = {
  email: string;
  setEmail: (email: string) => void;
  sending: boolean;
  disabled: boolean;
  onSend: () => void;
};

/** Step 1 of email sign-in: type an address and get a code. */
export function EmailEntryCard({ email, setEmail, sending, disabled, onSend }: EmailEntryCardProps) {
  const theme = useTheme();
  return (
    <Card style={styles.emailCard}>
      <Text variant="overline">Email</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={theme.textTertiary}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="send"
        onSubmitEditing={onSend}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
        accessibilityLabel="Email address"
      />
      <Text variant="caption">We’ll email you a sign-in code. No password needed.</Text>
      <Button title="Send code" loading={sending} disabled={disabled} onPress={onSend} />
    </Card>
  );
}

type CodeEntryCardProps = {
  email: string;
  code: string;
  setCode: (code: string) => void;
  verifying: boolean;
  disabled: boolean;
  onVerify: () => void;
  onChangeEmail: () => void;
};

/** Step 2 of email sign-in: enter the code that was emailed. */
export function CodeEntryCard({ email, code, setCode, verifying, disabled, onVerify, onChangeEmail }: CodeEntryCardProps) {
  const theme = useTheme();
  return (
    <Card style={styles.emailCard}>
      <Text variant="overline">Code sent to {email}</Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="12345678"
        placeholderTextColor={theme.textTertiary}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={10}
        autoFocus
        onSubmitEditing={onVerify}
        style={[styles.input, styles.code, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
        accessibilityLabel="Code from the email"
      />
      <Button title="Verify" loading={verifying} disabled={disabled} onPress={onVerify} />
      <Button title="Use a different email" variant="ghost" size="small" onPress={onChangeEmail} />
    </Card>
  );
}

const styles = StyleSheet.create({
  emailCard: { gap: Spacing.three },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three, fontSize: 17 },
  code: { fontSize: 26, letterSpacing: 8, textAlign: 'center' },
});

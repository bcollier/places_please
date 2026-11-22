import { useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteAccount,
  signOut,
  startEmail,
  verifyEmailCode,
  type AccountResult,
} from '@/lib/account';
import { confirmAction, showAlert } from '@/lib/dialogs';
import { AppError, toUserMessage } from '@/lib/errors';
import { goBack, goHome } from '@/lib/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useData } from '@/providers/data-provider';

type EmailStep = { kind: 'enter' } | { kind: 'code'; email: string };

export default function AccountScreen() {
  const { account } = useAuth();
  return account.isGuest ? <SaveAccount /> : <SignedIn />;
}

function SaveAccount() {
  const theme = useTheme();
  const { refresh } = useData();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailStep, setEmailStep] = useState<EmailStep>({ kind: 'enter' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');


  const finish = async (result: AccountResult) => {
    if (result.kind === 'cancelled') return;
    await refresh();
    const message =
      result.mergedScripts > 0
        ? `Signed in. ${result.mergedScripts} script${result.mergedScripts === 1 ? '' : 's'} from this phone were saved to your account.`
        : 'Signed in. Your scripts are saved to your account.';
    showAlert('You’re all set', message, goBack);
  };

  const run = async (key: string, fn: () => Promise<AccountResult>) => {
    setBusy(key);
    setError(null);
    try {
      await finish(await fn());
    } catch (err) {
      if (err instanceof AppError && err.code === 'merge_pending') {
        // Signed in; the copy finishes automatically later.
        await refresh();
        showAlert('Signed in', err.message, goBack);
      } else {
        setError(toUserMessage(err));
      }
    } finally {
      setBusy(null);
    }
  };

  const sendCode = () =>
    run('email', async () => {
      const address = await startEmail(email);
      setEmailStep({ kind: 'code', email: address });
      setCode('');
      return { kind: 'cancelled' };
    });

  const checkCode = () => {
    if (emailStep.kind !== 'code') return;
    void run('code', () => verifyEmailCode(emailStep.email, code));
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <View style={styles.inner}>
        <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
          <Icon name="theatermasks.fill" size={28} color={theme.primary} />
        </View>
        <Text variant="display" style={styles.center}>
          Keep your scripts safe
        </Text>
        <Text variant="body" color="textSecondary" style={styles.center}>
          Sign in with your email to save your scripts and practice history, and pick up on any device. Everything you’ve
          done so far comes with you.
        </Text>

        {error ? (
          <Card style={[styles.error, { backgroundColor: theme.missSoft, borderColor: theme.miss }]}>
            <Icon name="exclamationmark.circle.fill" size={18} color={theme.miss} />
            <Text variant="callout" style={styles.flex}>
              {error}
            </Text>
          </Card>
        ) : null}

        <View style={styles.buttons}>
          {emailStep.kind === 'enter' ? (
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
                onSubmitEditing={sendCode}
                style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                accessibilityLabel="Email address"
              />
              <Text variant="caption">We’ll email you a sign-in code. No password needed.</Text>
              <Button title="Send code" loading={busy === 'email'} disabled={!!busy || !email.trim()} onPress={sendCode} />
            </Card>
          ) : null}

          {emailStep.kind === 'code' ? (
            <Card style={styles.emailCard}>
              <Text variant="overline">Code sent to {emailStep.email}</Text>
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
                onSubmitEditing={checkCode}
                style={[styles.input, styles.code, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
                accessibilityLabel="Code from the email"
              />
              <Button title="Verify" loading={busy === 'code'} disabled={!!busy || code.trim().length < 6} onPress={checkCode} />
              <Button title="Use a different email" variant="ghost" size="small" onPress={() => setEmailStep({ kind: 'enter' })} />
            </Card>
          ) : null}
        </View>

        <Text variant="caption" style={styles.center}>
          Already have an account from another phone? Use the same email. This phone’s scripts will be added to it.
        </Text>
      </View>
    </ScrollView>
  );
}

function SignedIn() {
  const theme = useTheme();
  const { account } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  const doSignOut = async () => {
    const ok = await confirmAction({
      title: 'Sign out?',
      message: 'Your scripts stay in your account. This device will start a fresh, empty session.',
      confirmLabel: 'Sign out',
      destructive: true,
    });
    if (!ok) return;
    setBusy('signout');
    try {
      await signOut();
      goHome();
    } catch (err) {
      showAlert('Not signed out', toUserMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const doDelete = async () => {
    const ok = await confirmAction({
      title: 'Delete all your data?',
      message:
        'This permanently deletes every script, your practice history and settings from Places, Please, then signs you out. It can’t be undone. Your email sign-in itself is kept, since your other apps use it too.',
      confirmLabel: 'Delete forever',
      destructive: true,
    });
    if (!ok) return;
    setBusy('delete');
    try {
      await deleteAccount();
      goHome();
    } catch (err) {
      showAlert('Not deleted', toUserMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      <View style={styles.inner}>
        <Card style={styles.signedIn}>
          <Icon name="checkmark.circle.fill" size={28} color={theme.perfect} />
          <View style={styles.flex}>
            <Text variant="heading">Signed in</Text>
            <Text variant="callout" color="textSecondary">
              {account.email}
            </Text>
          </View>
        </Card>
        <Text variant="callout" color="textSecondary">
          Your scripts and practice history are saved to your account and available on any device where you sign in.
        </Text>
        <Button title="Sign out" variant="secondary" loading={busy === 'signout'} disabled={!!busy} onPress={() => void doSignOut()} />
        <Button title="Delete my data" icon="trash" variant="destructive" loading={busy === 'delete'} disabled={!!busy} onPress={() => void doDelete()} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.five, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four },
  center: { textAlign: 'center' },
  flex: { flex: 1 },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  error: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  buttons: { gap: Spacing.three, marginTop: Spacing.three },
  emailCard: { gap: Spacing.three },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three, fontSize: 17 },
  code: { fontSize: 26, letterSpacing: 8, textAlign: 'center' },
  signedIn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});

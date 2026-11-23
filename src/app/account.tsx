import { ScrollView, StyleSheet, View } from 'react-native';

import { CodeEntryCard, EmailEntryCard } from '@/components/account/email-sign-in-cards';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAccountActions } from '@/hooks/use-account-actions';
import { useEmailSignIn } from '@/hooks/use-email-sign-in';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/providers/auth-provider';

export default function AccountScreen() {
  const { account } = useAuth();
  return account.isGuest ? <SaveAccount /> : <SignedIn />;
}

function SaveAccount() {
  const theme = useTheme();
  const signIn = useEmailSignIn();
  const { busy, emailStep } = signIn;

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
      <View style={styles.inner}>
        <SaveAccountIntro />

        {signIn.error ? <SignInError message={signIn.error} /> : null}

        <View style={styles.buttons}>
          {emailStep.kind === 'enter' ? (
            <EmailEntryCard
              email={signIn.email}
              setEmail={signIn.setEmail}
              sending={busy === 'email'}
              disabled={!!busy || !signIn.email.trim()}
              onSend={signIn.sendCode}
            />
          ) : null}

          {emailStep.kind === 'code' ? (
            <CodeEntryCard
              email={emailStep.email}
              code={signIn.code}
              setCode={signIn.setCode}
              verifying={busy === 'code'}
              disabled={!!busy || signIn.code.trim().length < 6}
              onVerify={signIn.checkCode}
              onChangeEmail={signIn.changeEmail}
            />
          ) : null}
        </View>

        <Text variant="caption" style={styles.center}>
          Already have an account from another phone? Use the same email. This phone’s scripts will be added to it.
        </Text>
      </View>
    </ScrollView>
  );
}

function SaveAccountIntro() {
  const theme = useTheme();
  return (
    <>
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
    </>
  );
}

function SignInError({ message }: { message: string }) {
  const theme = useTheme();
  return (
    <Card style={[styles.error, { backgroundColor: theme.missSoft, borderColor: theme.miss }]}>
      <Icon name="exclamationmark.circle.fill" size={18} color={theme.miss} />
      <Text variant="callout" style={styles.flex}>
        {message}
      </Text>
    </Card>
  );
}

function SignedIn() {
  const theme = useTheme();
  const { account } = useAuth();
  const { busy, confirmSignOut, confirmDelete } = useAccountActions();

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
        <Button title="Sign out" variant="secondary" loading={busy === 'signout'} disabled={!!busy} onPress={() => void confirmSignOut()} />
        <Button title="Delete my data" icon="trash" variant="destructive" loading={busy === 'delete'} disabled={!!busy} onPress={() => void confirmDelete()} />
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
  signedIn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});

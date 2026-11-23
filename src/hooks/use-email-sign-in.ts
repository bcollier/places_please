import { useState } from 'react';

import { startEmail, verifyEmailCode, type AccountResult } from '@/lib/account';
import { showAlert } from '@/lib/dialogs';
import { AppError, toUserMessage } from '@/lib/errors';
import { goBack } from '@/lib/navigation';
import { useData } from '@/providers/data-provider';

export type EmailStep = { kind: 'enter' } | { kind: 'code'; email: string };

/** Which request is running: sending the code, or checking it. */
type BusyKey = 'email' | 'code';

function signedInMessage(mergedScripts: number): string {
  return mergedScripts > 0
    ? `Signed in. ${mergedScripts} script${mergedScripts === 1 ? '' : 's'} from this phone were saved to your account.`
    : 'Signed in. Your scripts are saved to your account.';
}

/** Email sign-in in two steps (send a code, then verify it), bringing this phone's scripts along. */
export function useEmailSignIn() {
  const { refresh } = useData();
  const [busy, setBusy] = useState<BusyKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailStep, setEmailStep] = useState<EmailStep>({ kind: 'enter' });
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');

  const finish = async (result: AccountResult) => {
    if (result.kind === 'cancelled') return;
    await refresh();
    showAlert('You’re all set', signedInMessage(result.mergedScripts), goBack);
  };

  const run = async (key: BusyKey, fn: () => Promise<AccountResult>) => {
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

  const changeEmail = () => setEmailStep({ kind: 'enter' });

  return { busy, error, emailStep, email, setEmail, code, setCode, sendCode, checkCode, changeEmail };
}

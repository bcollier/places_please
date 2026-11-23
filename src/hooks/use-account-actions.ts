import { useState } from 'react';

import { deleteAccount, signOut } from '@/lib/account';
import { confirmAction, showAlert } from '@/lib/dialogs';
import { toUserMessage } from '@/lib/errors';
import { goHome } from '@/lib/navigation';

type BusyKey = 'signout' | 'delete';

type ConfirmedAction = {
  key: BusyKey;
  confirm: Parameters<typeof confirmAction>[0];
  action: () => Promise<void>;
  failureTitle: string;
};

/** Sign out and delete-my-data for a signed-in account, each behind a confirmation. */
export function useAccountActions() {
  const [busy, setBusy] = useState<BusyKey | null>(null);

  /** Asks first; if confirmed, runs the action and goes home, or explains why it failed. */
  const runConfirmed = async ({ key, confirm, action, failureTitle }: ConfirmedAction) => {
    const ok = await confirmAction(confirm);
    if (!ok) return;
    setBusy(key);
    try {
      await action();
      goHome();
    } catch (err) {
      showAlert(failureTitle, toUserMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const confirmSignOut = () =>
    runConfirmed({
      key: 'signout',
      confirm: {
        title: 'Sign out?',
        message: 'Your scripts stay in your account. This device will start a fresh, empty session.',
        confirmLabel: 'Sign out',
        destructive: true,
      },
      action: signOut,
      failureTitle: 'Not signed out',
    });

  const confirmDelete = () =>
    runConfirmed({
      key: 'delete',
      confirm: {
        title: 'Delete all your data?',
        message:
          'This permanently deletes every script, your practice history and settings from Places, Please, then signs you out. It can’t be undone. Your email sign-in itself is kept, since your other apps use it too.',
        confirmLabel: 'Delete forever',
        destructive: true,
      },
      action: deleteAccount,
      failureTitle: 'Not deleted',
    });

  return { busy, confirmSignOut, confirmDelete };
}

import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { confirmAction, showAlert } from '@/lib/dialogs';
import { toUserMessage } from '@/lib/errors';
import { goBack } from '@/lib/navigation';
import type { Script } from '@/lib/types';
import { useData } from '@/providers/data-provider';

/** Asks for confirmation, deletes the script and its history, then leaves the screen. */
export function DeleteScriptButton({ script }: { script: Script }) {
  const { removeScript } = useData();
  const [busy, setBusy] = useState(false);

  const confirmDelete = async () => {
    const ok = await confirmAction({
      title: 'Delete this script?',
      message: `“${script.title}” and its practice history will be removed.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await removeScript(script.id);
      goBack();
    } catch (err) {
      setBusy(false);
      showAlert('Not deleted', toUserMessage(err));
    }
  };

  return (
    <Button title="Delete script" icon="trash" variant="destructive" size="medium" onPress={() => void confirmDelete()} loading={busy} style={styles.delete} />
  );
}

const styles = StyleSheet.create({
  delete: { marginTop: Spacing.six },
});

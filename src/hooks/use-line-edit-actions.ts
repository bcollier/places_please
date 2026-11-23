import { router } from 'expo-router';
import { useState } from 'react';

import type { LineDraft } from '@/hooks/use-line-draft';
import { confirmAction, showAlert } from '@/lib/dialogs';
import { toUserMessage } from '@/lib/errors';
import { goBack } from '@/lib/navigation';
import { newLineId, uniqueCharacters } from '@/lib/script-model';
import type { Script, ScriptLine } from '@/lib/types';
import { useData } from '@/providers/data-provider';

/** Save, insert-after and delete for the line editor, with a shared `saving` flag. */
export function useLineEditActions(script: Script, line: ScriptLine, draft: LineDraft) {
  const { saveScript } = useData();
  const [saving, setSaving] = useState(false);

  // Saves the edited lines and closes the editor. If the actor's character no longer has any lines, unset it.
  const commit = async (lines: ScriptLine[]) => {
    setSaving(true);
    try {
      const chars = uniqueCharacters(lines);
      await saveScript(script.id, {
        lines,
        characters: chars,
        ...(script.my_character && !chars.includes(script.my_character) ? { my_character: null } : {}),
      });
      goBack();
    } catch (err) {
      showAlert('Not saved', toUserMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const save = () => {
    const trimmed = draft.text.trim();
    if (!trimmed) {
      showAlert('Line is empty', 'Type the line, or delete it instead.');
      return;
    }
    void commit(script.lines.map((l) => (l.id === line.id ? { ...l, text: trimmed, character: draft.speaker } : l)));
  };

  // Adds a placeholder line after this one and opens it in the editor.
  const insertAfter = () => {
    const idx = script.lines.findIndex((l) => l.id === line.id);
    const inserted = { id: newLineId(), character: line.character, text: '(new line)', scene: line.scene };
    const lines = [...script.lines.slice(0, idx + 1), inserted, ...script.lines.slice(idx + 1)];
    setSaving(true);
    saveScript(script.id, { lines })
      .then(() => router.replace({ pathname: '/scripts/[id]/line/[lineId]', params: { id: script.id, lineId: inserted.id } }))
      .catch((err) => showAlert('Not saved', toUserMessage(err)))
      .finally(() => setSaving(false));
  };

  const remove = async () => {
    const ok = await confirmAction({ title: 'Delete this line?', confirmLabel: 'Delete', destructive: true });
    if (ok) await commit(script.lines.filter((l) => l.id !== line.id));
  };

  return { saving, save, insertAfter, remove };
}

import { useState } from 'react';

import type { ScriptLine } from '@/lib/types';

/**
 * The unsaved edits to a line: its text, and its speaker, either picked from the cast or typed as
 * a new name (a typed name wins).
 */
export function useLineDraft(line: ScriptLine | undefined) {
  const [text, setText] = useState(line?.text ?? '');
  const [character, setCharacter] = useState(line?.character ?? '');
  const [newCharacter, setNewCharacter] = useState('');

  const pickCharacter = (name: string) => {
    setNewCharacter('');
    setCharacter(name);
  };

  return {
    text,
    setText,
    character,
    pickCharacter,
    newCharacter,
    setNewCharacter,
    typingNewName: !!newCharacter.trim(),
    speaker: (newCharacter.trim() || character).toUpperCase(),
  };
}

export type LineDraft = ReturnType<typeof useLineDraft>;

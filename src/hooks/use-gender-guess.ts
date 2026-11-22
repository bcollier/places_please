import { useEffect } from 'react';

import { guessGenders } from '@/lib/ai';
import { uniqueCharacters } from '@/lib/script-model';
import type { Gender, Script } from '@/lib/types';
import { useData } from '@/providers/data-provider';

const attempted = new Set<string>();

/**
 * Scripts imported before voice casting existed have no genders, so voices alternate woman/man.
 * This asks the AI once per script (per app session) and saves the guesses. Never throws.
 */
export function useGenderGuess(script: Script | undefined) {
  const { saveScript } = useData();
  useEffect(() => {
    if (!script) return;
    const missing = uniqueCharacters(script.lines).filter((c) => !script.character_genders[c]);
    if (missing.length === 0 || attempted.has(script.id)) return;
    attempted.add(script.id);
    const characters = missing.map((name) => ({
      name,
      sample: script.lines
        .filter((l) => l.character === name)
        .slice(0, 2)
        .map((l) => l.text)
        .join(' ')
        .slice(0, 300),
    }));
    guessGenders(characters)
      .then(async ({ characters: guesses }) => {
        const genders: Record<string, Gender> = { ...script.character_genders };
        let changed = false;
        for (const g of guesses) {
          if ((g.gender === 'female' || g.gender === 'male') && missing.includes(g.name) && !genders[g.name]) {
            genders[g.name] = g.gender;
            changed = true;
          }
        }
        if (changed) await saveScript(script.id, { character_genders: genders });
      })
      .catch((err) => console.warn('[voices] gender guess failed', err));
  }, [script, saveScript]);
}

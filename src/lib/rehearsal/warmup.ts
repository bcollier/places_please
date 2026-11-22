import { cuePairs } from '@/lib/script-model';
import type { ScriptLine } from '@/lib/types';

/**
 * Warm Up flash cards: show a partner's cue line, pick the line you say next.
 * Distractors come from your other lines (ideally similar length) so you have to really know it.
 */

export type WarmupQuestion = {
  cue: ScriptLine;
  answer: ScriptLine;
  choices: ScriptLine[];
};

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildWarmupRound(lines: ScriptLine[], me: string, count = 10, choicesPerQuestion = 4): WarmupQuestion[] {
  const pairs = cuePairs(lines, me);
  const myLines = lines.filter((l) => l.character === me);
  const otherLines = lines.filter((l) => l.character !== me);

  const picked = shuffle(pairs).slice(0, count);
  return picked.map(({ cue, mine }) => {
    const sameText = (l: ScriptLine) => l.text.trim().toLowerCase() === mine.text.trim().toLowerCase();
    let pool = myLines.filter((l) => l.id !== mine.id && !sameText(l));
    if (pool.length < choicesPerQuestion - 1) {
      pool = [...pool, ...otherLines.filter((l) => l.id !== cue.id && !sameText(l))];
    }
    // Prefer distractors of similar length, with some randomness.
    const len = mine.text.length;
    const distractors = shuffle(pool)
      .sort((a, b) => Math.abs(a.text.length - len) - Math.abs(b.text.length - len))
      .slice(0, Math.min(pool.length, (choicesPerQuestion - 1) * 3));
    const chosen: ScriptLine[] = [];
    for (const d of shuffle(distractors)) {
      if (chosen.length >= choicesPerQuestion - 1) break;
      if (!chosen.some((c) => c.text === d.text)) chosen.push(d);
    }
    return { cue, answer: mine, choices: shuffle([mine, ...chosen]) };
  });
}

export function warmupAvailable(lines: ScriptLine[], me: string | null): boolean {
  if (!me) return false;
  return cuePairs(lines, me).length > 0 && lines.length >= 3;
}

import { cuePairs } from '@/lib/script-model';
import type { ScriptLine } from '@/lib/types';

/**
 * Warm Up flash cards: show a partner's cue line, pick the line you say next.
 *
 * Every card is genuinely multiple choice: the right answer plus at least one (up to three) wrong
 * answers whose wording is different from it and from each other (compared ignoring case and
 * punctuation). Distractors come from your other lines first (similar length preferred), then from
 * other characters' lines. Cues that can't get a wrong answer are left out, and Warm Up is only
 * offered when at least one card can be made.
 */

export type WarmupQuestion = {
  cue: ScriptLine;
  answer: ScriptLine;
  choices: ScriptLine[];
};

export const MIN_CHOICES = 2;
export const MAX_CHOICES = 4;

/** Wording used to decide whether two lines are "the same answer". */
export function normalizeForChoice(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestion(
  cue: ScriptLine,
  answer: ScriptLine,
  lines: ScriptLine[],
  me: string,
  maxChoices: number,
  random: () => number,
): WarmupQuestion | null {
  const answerKey = normalizeForChoice(answer.text);
  const seen = new Set<string>([answerKey]);
  const distinct = (pool: ScriptLine[]) =>
    pool.filter((l) => {
      const key = normalizeForChoice(l.text);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const len = answer.text.length;
  const bySimilarLength = (pool: ScriptLine[]) =>
    shuffle(pool, random).sort((a, b) => Math.abs(a.text.length - len) - Math.abs(b.text.length - len));

  // Mine first (the hard case: which of MY lines comes next?), then others' lines, never the cue.
  const mine = distinct(bySimilarLength(lines.filter((l) => l.character === me && l.id !== answer.id)));
  const others = distinct(bySimilarLength(lines.filter((l) => l.character !== me && l.id !== cue.id)));
  const wrong = [...mine, ...others].slice(0, maxChoices - 1);
  if (wrong.length < MIN_CHOICES - 1) return null;
  return { cue, answer, choices: shuffle([answer, ...wrong], random) };
}

export function buildWarmupRound(
  lines: ScriptLine[],
  me: string,
  count = 10,
  maxChoices = MAX_CHOICES,
  random: () => number = Math.random,
): WarmupQuestion[] {
  const questions: WarmupQuestion[] = [];
  for (const { cue, mine } of shuffle(cuePairs(lines, me), random)) {
    if (questions.length >= count) break;
    const q = buildQuestion(cue, mine, lines, me, maxChoices, random);
    if (q) questions.push(q);
  }
  return questions;
}

/** True when at least one genuinely multiple-choice card can be made. */
export function warmupAvailable(lines: ScriptLine[], me: string | null): boolean {
  if (!me) return false;
  return cuePairs(lines, me).some(({ cue, mine }) => buildQuestion(cue, mine, lines, me, MAX_CHOICES, Math.random) !== null);
}

import type { LineVerdict } from '@/lib/types';

/**
 * Compares what the actor said with the scripted line, word by word.
 *
 * - perfect: every word matches (ignoring case and punctuation)
 * - close:   most words match (a dropped "the", a swapped word): the line is right but not exact
 * - missed:  too many words differ, or nothing was said
 */

export type DiffToken = {
  word: string;
  /** ok = said correctly, missing = in script but not said, extra = said but not in script, wrong = said instead of the script word */
  kind: 'ok' | 'missing' | 'extra' | 'wrong';
  /** For 'wrong', what was said instead. */
  said?: string;
};

export type LineScore = {
  verdict: Exclude<LineVerdict, 'skipped'>;
  accuracy: number;
  diff: DiffToken[];
};

/** Minimum share of words that must line up for "a little off but correct". */
export const CLOSE_THRESHOLD = 0.75;

const NUMBER_WORDS: Record<string, string> = {
  '0': 'zero', '1': 'one', '2': 'two', '3': 'three', '4': 'four', '5': 'five', '6': 'six',
  '7': 'seven', '8': 'eight', '9': 'nine', '10': 'ten', '11': 'eleven', '12': 'twelve',
  '13': 'thirteen', '14': 'fourteen', '15': 'fifteen', '16': 'sixteen', '17': 'seventeen',
  '18': 'eighteen', '19': 'nineteen', '20': 'twenty', '30': 'thirty', '40': 'forty',
  '50': 'fifty', '100': 'hundred',
};

const SPELLING_EQUIVALENTS: Record<string, string> = {
  ok: 'okay',
  alright: 'all right',
  mr: 'mister',
  mrs: 'missus',
  dr: 'doctor',
  st: 'saint',
  til: 'till',
  'til’': 'till',
};

/** Splits display text into the original words (keeps punctuation for display). */
function displayWords(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

export function normalizeWord(word: string): string {
  let w = word
    .toLowerCase()
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[^a-z0-9']/g, '')
    .replace(/^'+|'+$/g, '');
  w = w.replace(/'/g, '');
  if (NUMBER_WORDS[w]) w = NUMBER_WORDS[w];
  return w;
}

export function tokenize(text: string): string[] {
  const expanded = text
    .replace(/[—–-]+/g, ' ') // dashes and hyphens separate words
    .replace(/…|\.\.\./g, ' ');
  const out: string[] = [];
  for (const raw of expanded.split(/\s+/)) {
    const w = normalizeWord(raw);
    if (!w) continue;
    const eq = SPELLING_EQUIVALENTS[w];
    if (eq) out.push(...eq.split(' '));
    else out.push(w);
  }
  return out;
}

/** Word-level edit operations aligning expected -> spoken. */
function align(expected: string[], spoken: string[]) {
  const n = expected.length;
  const m = spoken.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 0; i <= n; i++) dp[i][0] = i;
  for (let j = 0; j <= m; j++) dp[0][j] = j;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const cost = expected[i - 1] === spoken[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  // Backtrack.
  const ops: { op: 'ok' | 'sub' | 'del' | 'ins'; i?: number; j?: number }[] = [];
  let i = n;
  let j = m;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && expected[i - 1] === spoken[j - 1] && dp[i][j] === dp[i - 1][j - 1]) {
      ops.push({ op: 'ok', i: i - 1, j: j - 1 });
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 1) {
      ops.push({ op: 'sub', i: i - 1, j: j - 1 });
      i--;
      j--;
    } else if (i > 0 && dp[i][j] === dp[i - 1][j] + 1) {
      ops.push({ op: 'del', i: i - 1 });
      i--;
    } else {
      ops.push({ op: 'ins', j: j - 1 });
      j--;
    }
  }
  ops.reverse();
  return { distance: dp[n][m], ops };
}

export function scoreLine(expectedText: string, spokenText: string): LineScore {
  const expected = tokenize(expectedText);
  const spoken = tokenize(spokenText);

  if (expected.length === 0) {
    return { verdict: 'perfect', accuracy: 1, diff: [] };
  }
  if (spoken.length === 0) {
    return {
      verdict: 'missed',
      accuracy: 0,
      diff: displayWords(expectedText).map((word) => ({ word, kind: 'missing' })),
    };
  }

  const { distance, ops } = align(expected, spoken);
  const accuracy = Math.max(0, 1 - distance / Math.max(expected.length, spoken.length));

  // Build a display diff using the original script words where possible.
  const scriptWords = displayWordsAligned(expectedText);
  const diff: DiffToken[] = ops.map((o) => {
    if (o.op === 'ok') return { word: scriptWords[o.i!] ?? expected[o.i!], kind: 'ok' };
    if (o.op === 'sub') return { word: scriptWords[o.i!] ?? expected[o.i!], kind: 'wrong', said: spoken[o.j!] };
    if (o.op === 'del') return { word: scriptWords[o.i!] ?? expected[o.i!], kind: 'missing' };
    return { word: spoken[o.j!], kind: 'extra' };
  });

  let verdict: LineScore['verdict'];
  if (distance === 0) verdict = 'perfect';
  else if (accuracy >= CLOSE_THRESHOLD) verdict = 'close';
  else verdict = 'missed';

  return { verdict, accuracy, diff };
}

/**
 * Display words aligned 1:1 with `tokenize` output so diffs can show original punctuation.
 * Falls back to normalized tokens when a word expands to several tokens.
 */
function displayWordsAligned(text: string): string[] {
  const words: string[] = [];
  const expanded = text.replace(/[—–-]+/g, ' ').replace(/…|\.\.\./g, ' ');
  for (const raw of expanded.split(/\s+/)) {
    const w = normalizeWord(raw);
    if (!w) continue;
    const eq = SPELLING_EQUIVALENTS[w];
    if (eq) words.push(...eq.split(' '));
    else words.push(raw);
  }
  return words;
}

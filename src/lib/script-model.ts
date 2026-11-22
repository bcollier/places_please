import type { ScriptLine } from '@/lib/types';

/** A line as returned by the AI parser for one chunk of pages. */
export type ParsedLine = {
  character: string;
  text: string;
  scene: string | null;
  continuation: boolean;
};

export function newLineId(): string {
  return `l_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeCharacterName(name: string): string {
  return name
    .replace(/\((?:V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D|CONTINUED)\)/gi, '')
    .replace(/[.:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/**
 * Appends one parsed chunk to the accumulated lines, merging a speech that continues across a page
 * boundary and mapping speaker names onto previously seen spellings.
 */
export function mergeParsedChunk(existing: ScriptLine[], chunk: ParsedLine[]): ScriptLine[] {
  const result = [...existing];
  const known = new Map(uniqueCharacters(existing).map((c) => [c, c]));

  chunk.forEach((raw, index) => {
    const text = raw.text.trim();
    if (!text) return;
    let character = normalizeCharacterName(raw.character);
    if (!character) return;
    character = known.get(character) ?? character;
    known.set(character, character);

    const previous = result[result.length - 1];
    if (index === 0 && raw.continuation && previous) {
      result[result.length - 1] = { ...previous, text: `${previous.text} ${text}` };
      return;
    }
    // The same speaker twice in a row with nothing between is one speech split by a page break.
    if (index === 0 && previous && previous.character === character && raw.scene === previous.scene) {
      result[result.length - 1] = { ...previous, text: `${previous.text} ${text}` };
      return;
    }
    result.push({ id: newLineId(), character, text, scene: raw.scene ?? previous?.scene ?? null });
  });

  return result;
}

export function uniqueCharacters(lines: ScriptLine[]): string[] {
  const seen = new Set<string>();
  for (const l of lines) seen.add(l.character);
  return [...seen];
}

/** Characters ordered by how many lines they have (most first). */
export function charactersByLineCount(lines: ScriptLine[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const l of lines) counts.set(l.character, (counts.get(l.character) ?? 0) + 1);
  return [...counts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
}

export function scenesOf(lines: ScriptLine[]): string[] {
  const scenes: string[] = [];
  for (const l of lines) {
    if (l.scene && !scenes.includes(l.scene)) scenes.push(l.scene);
  }
  return scenes;
}

/** Lines in a scene (or all lines when scene is null). */
export function linesInScene(lines: ScriptLine[], scene: string | null): ScriptLine[] {
  if (!scene) return lines;
  return lines.filter((l) => l.scene === scene);
}

/** Scenes in which the character speaks. */
export function scenesWithCharacter(lines: ScriptLine[], character: string): string[] {
  return scenesOf(lines.filter((l) => l.character === character));
}

/** Pairs of (cue line spoken by someone else, my response) for flash cards. */
export function cuePairs(lines: ScriptLine[], me: string): { cue: ScriptLine; mine: ScriptLine }[] {
  const pairs: { cue: ScriptLine; mine: ScriptLine }[] = [];
  for (let i = 1; i < lines.length; i++) {
    const prev = lines[i - 1];
    const cur = lines[i];
    if (cur.character === me && prev.character !== me) pairs.push({ cue: prev, mine: cur });
  }
  return pairs;
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

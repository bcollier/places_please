import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cuePairs, linesInScene, mergeParsedChunk, normalizeCharacterName, scenesWithCharacter } from '@/lib/script-model';
import type { ScriptLine } from '@/lib/types';

test('character names are normalized', () => {
  assert.equal(normalizeCharacterName("Hamlet (CONT'D)"), 'HAMLET');
  assert.equal(normalizeCharacterName('  willy  (V.O.)'), 'WILLY');
  assert.equal(normalizeCharacterName('HAM.'), 'HAM');
});

test('a speech continued across a page break is merged into one line', () => {
  const first = mergeParsedChunk([], [{ character: 'HAMLET', text: 'To be, or not', scene: 'Act 3', continuation: false }]);
  const merged = mergeParsedChunk(first, [
    { character: 'HAMLET', text: 'to be.', scene: 'Act 3', continuation: true },
    { character: 'OPHELIA', text: 'My lord?', scene: 'Act 3', continuation: false },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].text, 'To be, or not to be.');
  assert.equal(merged[1].character, 'OPHELIA');
});

test('empty lines and names are dropped', () => {
  const merged = mergeParsedChunk([], [
    { character: '', text: 'stage direction', scene: null, continuation: false },
    { character: 'A', text: '   ', scene: null, continuation: false },
  ]);
  assert.equal(merged.length, 0);
});

const L = (id: string, character: string, text: string, scene: string | null = null): ScriptLine => ({ id, character, text, scene });

test('cue pairs are a partner line followed by mine', () => {
  const lines = [L('1', 'A', 'hi'), L('2', 'ME', 'hello'), L('3', 'ME', 'again'), L('4', 'B', 'yo'), L('5', 'ME', 'bye')];
  assert.deepEqual(
    cuePairs(lines, 'ME').map((p) => [p.cue.id, p.mine.id]),
    [['1', '2'], ['4', '5']],
  );
});

test('scenes filter lines', () => {
  const lines = [L('1', 'A', 'x', 'S1'), L('2', 'ME', 'y', 'S1'), L('3', 'A', 'z', 'S2')];
  assert.deepEqual(scenesWithCharacter(lines, 'ME'), ['S1']);
  assert.equal(linesInScene(lines, 'S2').length, 1);
  assert.equal(linesInScene(lines, null).length, 3);
});

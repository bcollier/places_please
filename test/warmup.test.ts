import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildWarmupRound, MIN_CHOICES, normalizeForChoice, warmupAvailable } from '@/lib/rehearsal/warmup';
import type { ScriptLine } from '@/lib/types';

const L = (id: string, character: string, text: string): ScriptLine => ({ id, character, text, scene: null });

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const scene = [
  L('1', 'OPHELIA', 'Good my lord, how does your honour?'),
  L('2', 'HAMLET', 'I humbly thank you; well, well, well.'),
  L('3', 'OPHELIA', 'My lord, I have remembrances of yours.'),
  L('4', 'HAMLET', 'No, not I; I never gave you aught.'),
  L('5', 'OPHELIA', 'My honoured lord, you know right well you did.'),
  L('6', 'HAMLET', 'Ha, ha! are you honest?'),
  L('7', 'OPHELIA', 'My lord?'),
  L('8', 'HAMLET', 'Are you fair?'),
];

test('every card has the answer plus distinct wrong answers', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const round = buildWarmupRound(scene, 'HAMLET', 10, 4, seeded(seed));
    assert.ok(round.length > 0);
    for (const q of round) {
      assert.ok(q.choices.length >= MIN_CHOICES, 'at least two choices');
      assert.ok(q.choices.some((c) => c.id === q.answer.id), 'answer is offered');
      const keys = q.choices.map((c) => normalizeForChoice(c.text));
      assert.equal(new Set(keys).size, keys.length, 'no two choices read the same');
      assert.ok(!q.choices.some((c) => c.id === q.cue.id), 'the cue is never a choice');
    }
  }
});

test('lines that only differ by case or punctuation are not offered as different answers', () => {
  const lines = [L('1', 'A', 'Here?'), L('2', 'ME', 'Here.'), L('3', 'A', 'here'), L('4', 'ME', 'HERE!')];
  // Every other line reads the same as an answer or is the cue, so no multiple-choice card is possible.
  assert.equal(warmupAvailable(lines, 'ME'), false);
  assert.deepEqual(buildWarmupRound(lines, 'ME'), []);
});

test('a tiny script with a real alternative still makes a two-choice card', () => {
  const lines = [L('1', 'A', 'Where?'), L('2', 'ME', 'Here.'), L('3', 'A', 'Really?')];
  assert.equal(warmupAvailable(lines, 'ME'), true);
  const [q] = buildWarmupRound(lines, 'ME', 10, 4, seeded(3));
  assert.equal(q.choices.length, 2);
});

test('no character, or no cue before my lines, means no Warm Up', () => {
  assert.equal(warmupAvailable(scene, null), false);
  assert.equal(warmupAvailable([L('1', 'ME', 'Alone.'), L('2', 'ME', 'Still alone.')], 'ME'), false);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CLOSE_THRESHOLD, scoreLine, tokenize } from '@/lib/scoring';

const LINE = 'To be, or not to be: that is the question.';

test('word perfect ignores case and punctuation', () => {
  const r = scoreLine(LINE, 'to be or not to be that is the question');
  assert.equal(r.verdict, 'perfect');
  assert.equal(r.accuracy, 1);
});

test('one swapped word is close, and the diff shows what was said', () => {
  const r = scoreLine(LINE, 'to be or not to be this is the question');
  assert.equal(r.verdict, 'close');
  assert.ok(r.accuracy >= CLOSE_THRESHOLD);
  const wrong = r.diff.filter((d) => d.kind === 'wrong');
  assert.deepEqual(wrong.map((d) => [d.word, d.said]), [['that', 'this']]);
});

test('a different line is missed', () => {
  assert.equal(scoreLine(LINE, 'whether tis nobler in the mind').verdict, 'missed');
});

test('saying nothing is missed with every word marked missing', () => {
  const r = scoreLine('Hello there.', '');
  assert.equal(r.verdict, 'missed');
  assert.equal(r.accuracy, 0);
  assert.ok(r.diff.every((d) => d.kind === 'missing'));
});

test('digits and number words, ok/okay, and dashes are treated as the same words', () => {
  assert.equal(scoreLine("I've got 2 tickets—okay?", "I've got two tickets ok").verdict, 'perfect');
  assert.deepEqual(tokenize('well-known'), ['well', 'known']);
});

test('contractions match the words written out, both ways', () => {
  const line = 'What happened? What’re you doing here?';
  assert.equal(scoreLine(line, 'What happened? What are you doing here?').verdict, 'perfect');
  assert.equal(scoreLine(line, "what happened what're you doing here").verdict, 'perfect');
  assert.equal(scoreLine("I don't know, I can't. It's gonna rain.", 'I do not know I cannot it is going to rain').verdict, 'perfect');
  assert.equal(scoreLine('We’ll go. I’m sure you’ve seen it.', 'we will go I am sure you have seen it').verdict, 'perfect');
  // Possessives aren't expanded.
  assert.deepEqual(tokenize("John's hat"), ['johns', 'hat']);
});

test('informal spellings and split words match what the transcript writes', () => {
  const line = 'Willy, I shoulda said this to you a long time ago. I don’t want you representing the company any more.';
  const said = 'Willy I should have said this to you a long time ago I do not want you representing the company anymore';
  assert.equal(scoreLine(line, said).verdict, 'perfect');
  assert.equal(scoreLine("Everybody's gotta pull his own weight.", "everybody's got to pull his own weight").verdict, 'perfect');
  assert.equal(scoreLine("C'mon, tell 'em 'cause I said so.", 'come on tell them because I said so').verdict, 'perfect');
  assert.equal(scoreLine("'Tis but thy name.", 'it is but thy name').verdict, 'perfect');
});

test('a contraction shows once in the diff, with its original spelling', () => {
  const r = scoreLine('What’re you doing?', 'what are you doing');
  const shown = r.diff.filter((d) => !d.joined).map((d) => d.word);
  assert.deepEqual(shown, ['What’re', 'you', 'doing?']);
  const wrong = scoreLine('What’re you doing?', 'what were you doing').diff.find((d) => d.kind === 'wrong');
  assert.equal(wrong?.said, 'were');
});

test('extra words lower accuracy', () => {
  const r = scoreLine('Are you fair?', 'um are you really fair');
  assert.notEqual(r.verdict, 'perfect');
  assert.ok(r.diff.some((d) => d.kind === 'extra'));
});

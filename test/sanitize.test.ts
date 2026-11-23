import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sanitizeGenders, sanitizeSettings } from '@/lib/sanitize';
import { DEFAULT_SETTINGS } from '@/lib/types';

test('missing or garbage settings fall back to defaults', () => {
  assert.deepEqual(sanitizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings('nonsense'), DEFAULT_SETTINGS);
});

test('out-of-range and unknown values are replaced', () => {
  const s = sanitizeSettings({ speechRate: 9, pauseLength: 'forever', pauseOnMistake: 'sometimes', voiceEngine: 'robot', cueSound: 'yes' });
  assert.equal(s.speechRate, DEFAULT_SETTINGS.speechRate);
  assert.equal(s.pauseLength, 'medium');
  assert.equal(s.pauseOnMistake, 'all');
  assert.equal(s.voiceEngine, 'elevenlabs');
  assert.equal(s.cueSound, DEFAULT_SETTINGS.cueSound);
});

test('valid values are kept', () => {
  const s = sanitizeSettings({ speechRate: 1.2, pauseLength: 'long', pauseOnMistake: 'never', voiceEngine: 'device', promptOnMiss: false });
  assert.equal(s.speechRate, 1.2);
  assert.equal(s.pauseLength, 'long');
  assert.equal(s.pauseOnMistake, 'never');
  assert.equal(s.voiceEngine, 'device');
  assert.equal(s.promptOnMiss, false);
});

test('genders keep only female/male', () => {
  assert.deepEqual(sanitizeGenders({ WILLY: 'male', LINDA: 'female', BIFF: 'unknown', X: 3 }), { WILLY: 'male', LINDA: 'female' });
  assert.deepEqual(sanitizeGenders(['male']), {});
  assert.deepEqual(sanitizeGenders(null), {});
});

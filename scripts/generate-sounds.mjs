#!/usr/bin/env node
/**
 * Generates the app's sound effects as small 16-bit mono WAV files in assets/sounds/.
 * Run with: node scripts/generate-sounds.mjs
 *
 * - perfect.wav  bright rising two-note chime ("ding!") for a word-perfect line
 * - close.wav    soft single mellow tone for a line that was a little off
 * - miss.wav     low, halting double buzz for a missed line
 * - cue.wav      short soft tick that signals "your turn, I'm listening"
 * - silence.wav  one second of silence, looped to keep the audio session alive with the screen off
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLE_RATE = 44100;
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'sounds');

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => {
    const v = Math.max(-1, Math.min(1, s));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  });
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

/** A bell-like note: fundamental plus soft overtones with exponential decay. */
function bell(freq, seconds, { decay = 4, gain = 0.5, start = 0 } = {}, buffer) {
  const n = Math.floor(seconds * SAMPLE_RATE);
  const offset = Math.floor(start * SAMPLE_RATE);
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.005);
    const env = attack * Math.exp(-decay * t);
    const s =
      Math.sin(2 * Math.PI * freq * t) +
      0.35 * Math.sin(2 * Math.PI * freq * 2 * t) +
      0.12 * Math.sin(2 * Math.PI * freq * 3.01 * t);
    buffer[offset + i] = (buffer[offset + i] ?? 0) + s * env * gain * 0.6;
  }
  return buffer;
}

/** A buzzy, slightly detuned square-ish tone for the "miss" sound. */
function buzz(freqStart, freqEnd, seconds, { gain = 0.35, start = 0 } = {}, buffer) {
  const n = Math.floor(seconds * SAMPLE_RATE);
  const offset = Math.floor(start * SAMPLE_RATE);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SAMPLE_RATE;
    const f = freqStart + (freqEnd - freqStart) * (i / n);
    phase += (2 * Math.PI * f) / SAMPLE_RATE;
    const attack = Math.min(1, t / 0.01);
    const release = Math.min(1, (seconds - t) / 0.04);
    const env = attack * release;
    // Soft-clipped sine gives a buzzy but not harsh tone.
    const s = Math.tanh(3 * Math.sin(phase)) * 0.7 + 0.3 * Math.sin(phase * 0.5);
    buffer[offset + i] = (buffer[offset + i] ?? 0) + s * env * gain;
  }
  return buffer;
}

function emptyBuffer(seconds) {
  return new Array(Math.floor(seconds * SAMPLE_RATE)).fill(0);
}

mkdirSync(outDir, { recursive: true });

// Word perfect: C6 then E6 then G6, quick sparkle.
let perfect = emptyBuffer(1.1);
bell(1046.5, 0.9, { decay: 5, gain: 0.45, start: 0 }, perfect);
bell(1318.5, 0.85, { decay: 5, gain: 0.45, start: 0.09 }, perfect);
bell(1568.0, 0.8, { decay: 4.5, gain: 0.5, start: 0.18 }, perfect);
writeFileSync(join(outDir, 'perfect.wav'), wav(perfect));

// A little off: one warm A5 tone, gentle.
let close = emptyBuffer(0.7);
bell(880, 0.65, { decay: 6, gain: 0.5 }, close);
writeFileSync(join(outDir, 'close.wav'), wav(close));

// Missed: two low halting buzzes, the second lower.
let miss = emptyBuffer(0.75);
buzz(196, 185, 0.22, { gain: 0.32, start: 0 }, miss);
buzz(165, 140, 0.38, { gain: 0.32, start: 0.3 }, miss);
writeFileSync(join(outDir, 'miss.wav'), wav(miss));

// Cue tick: very short, soft high blip.
let cue = emptyBuffer(0.18);
bell(1760, 0.15, { decay: 30, gain: 0.35 }, cue);
writeFileSync(join(outDir, 'cue.wav'), wav(cue));

// Silence for the keep-alive loop.
writeFileSync(join(outDir, 'silence.wav'), wav(emptyBuffer(1)));

console.log(`Wrote sounds to ${outDir}`);

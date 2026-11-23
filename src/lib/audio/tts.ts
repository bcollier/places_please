import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { synthesizeSpeech } from '@/lib/ai';
import { Cancellation } from '@/lib/audio/cancel';
import { AppError, CancelledError } from '@/lib/errors';
import { countWords } from '@/lib/script-model';
import type { Gender, VoiceEngine } from '@/lib/types';

/**
 * Scene-partner voices.
 *
 * - ElevenLabs voices (through the places-ai edge function, which holds the key and logs the cost):
 *   natural male and female voices. Each line is downloaded once and cached; the next lines are fetched ahead of time.
 * - The device's built-in voices: offline fallback. If ElevenLabs fails for any reason, the line
 *   is spoken with the device voice instead, so a rehearsal never stops.
 */

export type VoiceChoice = {
  /** ElevenLabs voice ID, or null to use the device voice. */
  cloud: string | null;
  device: { voice?: string; pitch: number };
};

export type VoiceCast = {
  forCharacter: (name: string) => VoiceChoice;
  prompter: VoiceChoice;
};

// ElevenLabs default voices (available on every account), most natural first.
export const FEMALE_VOICES = [
  'EXAVITQu4vr4xnSDxMaL', // Sarah
  'FGY2WhTYpPnrIDTdsKH5', // Laura
  'cgSgspJ2msm6clMCkdW9', // Jessica
  'XrExE9yKIg1WjnnlVkGX', // Matilda
  'Xb7hH8MSUJpSbSDYk0k2', // Alice (British)
  'pFZP5JQG7iQjIQuC4Bku', // Lily (British)
];
export const MALE_VOICES = [
  'JBFqnCBsd6RMkjVDRZzb', // George (British)
  'nPczCjzI2devNBz1zQrb', // Brian
  'cjVigY5qzO86Huf0OWal', // Eric
  'iP95p4xoKVk53GoZ742B', // Chris
  'TX3LPaxmHKxFdv7VOQHJ', // Liam
  'onwK4e9ZLuTAKqWW03F9', // Daniel (British)
  'bIHbv24MWmeRgasZH58o', // Will
  'N2lVS1w4EtoT3dr4eOWO', // Callum
];
const PROMPTER_VOICE = 'EXAVITQu4vr4xnSDxMaL';

// ---------------------------------------------------------------------------
// Device voices
// ---------------------------------------------------------------------------

// Novelty and robotic voices that make a scene partner sound silly.
const EXCLUDED_VOICE =
  /speech\.synthesis\.voice|eloquence|\b(Bad News|Bahh|Bells|Boing|Bubbles|Cellos|Good News|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox|Albert|Fred|Junior|Ralph|Kathy|Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;
// Natural-sounding voices found on Macs, iPhones and in Chrome.
const GOOD_VOICE = /\b(Google|Samantha|Alex|Daniel|Karen|Moira|Tessa|Ava|Zoe|Evan|Nathan|Allison|Susan|Tom|Serena|Oliver|Arthur|Martha|Catherine|Gordon|Lee|Aaron|Nicky|Siri)\b/i;

let voiceCache: Speech.Voice[] | null = null;

function voiceRank(v: Speech.Voice): number {
  let rank = 0;
  if (/premium/i.test(v.identifier)) rank += 40;
  if (v.quality === Speech.VoiceQuality.Enhanced || /enhanced/i.test(v.identifier)) rank += 20;
  if (/siri/i.test(v.identifier)) rank += 10;
  if (GOOD_VOICE.test(`${v.name} ${v.identifier}`)) rank += 15;
  if (v.language === 'en-US') rank += 6;
  else if (v.language === 'en-GB') rank += 4;
  else if (v.language.startsWith('en')) rank += 2;
  return rank;
}

/** English device voices, best first. Falls back to an empty list (system default voice) on failure. */
export async function getVoices(): Promise<Speech.Voice[]> {
  if (voiceCache) return voiceCache;
  try {
    const all = await Speech.getAvailableVoicesAsync();
    voiceCache = all
      .filter((v) => v.language?.toLowerCase().startsWith('en') && !EXCLUDED_VOICE.test(`${v.identifier} ${v.name}`))
      .sort((a, b) => voiceRank(b) - voiceRank(a));
  } catch (err) {
    console.warn('[tts] voice list failed', err);
    voiceCache = [];
  }
  return voiceCache;
}

const PITCHES = [1.0, 0.92, 1.08, 0.96, 1.04, 0.88, 1.12];

// Device voices don't report a gender, so sort them by their (well-known) names.
const MALE_VOICE_NAME =
  /\b(male|alex|daniel|fred|evan|nathan|tom|aaron|arthur|gordon|lee|oliver|rishi|reed|rocko|eddy|grandpa|ralph|junior|david|mark|guy|george|james|jamie|martin|thomas|ryan|andrew|brian|christopher|eric|roger|steffan|aditya|matthew|justin|joey|russell|geraint)\b/i;
const FEMALE_VOICE_NAME =
  /\b(female|samantha|karen|moira|tessa|ava|zoe|allison|susan|joelle|noelle|serena|kate|fiona|victoria|veena|nicky|zira|hazel|catherine|martha|flo|shelley|sandy|grandma|kathy|emma|jenny|aria|libby|sonia|michelle|ivy|joanna|kendra|kimberly|salli|nicole|olivia|amy|emily|google us english)\b/i;

function deviceVoiceGender(v: Speech.Voice): 'female' | 'male' | 'unknown' {
  const label = `${v.name} ${v.identifier}`;
  if (FEMALE_VOICE_NAME.test(label)) return 'female';
  if (MALE_VOICE_NAME.test(label)) return 'male';
  return 'unknown';
}

// ---------------------------------------------------------------------------
// Casting
// ---------------------------------------------------------------------------

/**
 * Gives each character a distinct voice: women from the female list, men from the male list,
 * unknown genders alternate. `me` is cast last so scene partners get the best voices.
 */
export async function castVoices(options: {
  characters: string[];
  me: string | null;
  genders?: Record<string, Gender>;
  engine: VoiceEngine;
}): Promise<VoiceCast> {
  const { characters, me, genders = {}, engine } = options;
  const deviceVoices = await getVoices();
  const femaleDevice = deviceVoices.filter((v) => deviceVoiceGender(v) === 'female');
  const maleDevice = deviceVoices.filter((v) => deviceVoiceGender(v) === 'male');
  const useCloud = engine === 'elevenlabs';
  const order = [...characters.filter((c) => c !== me), ...(me && characters.includes(me) ? [me] : [])];

  const map = new Map<string, VoiceChoice>();
  let f = 0;
  let m = 0;
  let unknownToggle = 0;
  order.forEach((name, i) => {
    let gender = genders[name] ?? 'unknown';
    if (gender === 'unknown') gender = unknownToggle++ % 2 === 0 ? 'female' : 'male';
    const slot = gender === 'female' ? f++ : m++;
    const cloud = gender === 'female' ? FEMALE_VOICES[slot % FEMALE_VOICES.length] : MALE_VOICES[slot % MALE_VOICES.length];
    const pool = gender === 'female' ? femaleDevice : maleDevice;
    const device = pool.length
      ? { voice: pool[slot % pool.length].identifier, pitch: PITCHES[Math.floor(slot / pool.length) % PITCHES.length] }
      : deviceVoices.length
        ? {
            voice: deviceVoices[i % deviceVoices.length].identifier,
            // No voice of the right gender installed: nudge the pitch instead.
            pitch: gender === 'male' ? 0.85 : 1.1,
          }
        : { pitch: gender === 'male' ? 0.85 : 1.1 };
    map.set(name, { cloud: useCloud ? cloud : null, device });
  });

  const prompter: VoiceChoice = {
    cloud: useCloud ? PROMPTER_VOICE : null,
    device: { voice: deviceVoices[Math.min(1, Math.max(0, deviceVoices.length - 1))]?.identifier, pitch: 1 },
  };
  return {
    forCharacter: (name: string) => map.get(name) ?? { cloud: useCloud ? FEMALE_VOICES[0] : null, device: { pitch: 1 } },
    prompter,
  };
}

// ---------------------------------------------------------------------------
// ElevenLabs voices: fetch, cache, play
// ---------------------------------------------------------------------------

/** Set when ElevenLabs can't work this session (no key, not allowed, out of credits or budget). */
let cloudDisabled = false;
/** After a failure, skip ElevenLabs until this time so lines aren't left silent while we wait. */
let cloudPausedUntil = 0;
const CLOUD_PAUSE_MS = 2 * 60_000;
const cloudOff = () => cloudDisabled || Date.now() < cloudPausedUntil;
const PERMANENT_FAILURES = new Set(['tts_not_configured', 'not_allowed', 'tts_quota', 'daily_limit']);

/** If a voice was retired by ElevenLabs, try the next voice of the same gender. */
async function fetchWithAlternate(text: string, voice: string, rate: number): Promise<string> {
  try {
    return (await synthesizeSpeech(text, voice, rate)).audio;
  } catch (err) {
    if (!(err instanceof AppError && err.code === 'voice_unavailable')) throw err;
    const pool = FEMALE_VOICES.includes(voice) ? FEMALE_VOICES : MALE_VOICES.includes(voice) ? MALE_VOICES : null;
    if (!pool) throw err;
    const alternate = pool[(pool.indexOf(voice) + 1) % pool.length];
    console.warn(`[tts] voice ${voice} unavailable; trying ${alternate}`);
    return (await synthesizeSpeech(text, alternate, rate)).audio;
  }
}

const audioCache = new Map<string, Promise<string>>();

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Each line is downloaded once: kept in memory and, on the phone, in the cache folder (no repeat charges). */
function cloudAudioUri(text: string, voice: string, rate: number): Promise<string> {
  const key = `${voice}|${rate}|${text}`;
  const cached = audioCache.get(key);
  if (cached) return cached;
  const promise = (async () => {
    const name = `el-${hash(key)}-${text.length}.mp3`;
    if (Platform.OS !== 'web') {
      const file = new File(Paths.cache, name);
      if (file.exists) return file.uri;
      const audio = await fetchWithAlternate(text, voice, rate);
      file.create({ overwrite: true });
      await file.write(audio, { encoding: 'base64' });
      return file.uri;
    }
    const audio = await fetchWithAlternate(text, voice, rate);
    return `data:audio/mpeg;base64,${audio}`;
  })();
  audioCache.set(key, promise);
  promise.catch((err) => {
    audioCache.delete(key);
    console.warn('[tts] ElevenLabs voice failed; using the phone voice.', err instanceof Error ? err.message : err);
    if (err instanceof AppError && PERMANENT_FAILURES.has(err.code)) cloudDisabled = true;
    else cloudPausedUntil = Date.now() + CLOUD_PAUSE_MS;
  });
  return promise;
}

/** Why ElevenLabs voices are off right now, or null when they're on. For the sound check. */
export function cloudVoiceStatus(): string | null {
  if (cloudDisabled) return 'turned off for this session after an error';
  if (Date.now() < cloudPausedUntil) return 'paused for a couple of minutes after an error';
  return null;
}

/** Lets the sound check try ElevenLabs again right away. */
export function resetCloudVoices() {
  cloudDisabled = false;
  cloudPausedUntil = 0;
}

let currentPlayer: AudioPlayer | null = null;

function playUri(uri: string, timeoutMs: number, token: Cancellation): Promise<void> {
  return new Promise((resolve, reject) => {
    if (token.cancelled) return reject(new CancelledError());
    let player: AudioPlayer;
    try {
      player = createAudioPlayer({ uri }, { keepAudioSessionActive: true });
    } catch (err) {
      return reject(err);
    }
    currentPlayer = player;
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      off();
      sub.remove();
      try {
        player.pause();
        player.remove();
      } catch {
        // ignore
      }
      if (currentPlayer === player) currentPlayer = null;
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(() => finish(), timeoutMs);
    const off = token.onCancel(() => finish(new CancelledError()));
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) finish();
      else if (status.error) finish(new Error(status.error));
    });
    player.play();
  });
}

/** Starts downloading upcoming lines so they play without a gap. Never throws. */
export function prefetchSpeech(text: string, choice: VoiceChoice, rate: number) {
  if (!choice.cloud || cloudOff() || !text.trim()) return;
  cloudAudioUri(text, choice.cloud, rate).catch(() => {});
}

// ---------------------------------------------------------------------------
// Speak
// ---------------------------------------------------------------------------

/**
 * Speaks text and resolves when finished. Rejects only with CancelledError.
 * ElevenLabs voice first (when chosen); any failure falls back to the device voice.
 */
export async function speak(text: string, choice: VoiceChoice, rate: number, token: Cancellation): Promise<void> {
  token.throwIfCancelled();
  const words = countWords(text);
  const timeoutMs = 6000 + (words / Math.max(0.5, rate)) * 700;

  if (choice.cloud && !cloudOff()) {
    try {
      const uri = await cloudAudioUri(text, choice.cloud, rate);
      token.throwIfCancelled();
      await playUri(uri, timeoutMs, token);
      return;
    } catch (err) {
      if (err instanceof CancelledError) throw err;
      console.warn('[tts] cloud voice failed; using device voice', err);
    }
  }
  return speakWithDevice(text, choice.device, rate, timeoutMs, token);
}

function speakWithDevice(
  text: string,
  device: VoiceChoice['device'],
  rate: number,
  timeoutMs: number,
  token: Cancellation,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (token.cancelled) return reject(new CancelledError());
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      off();
      if (err) reject(err);
      else resolve();
    };
    const timer = setTimeout(() => {
      console.warn('[tts] speech timed out; continuing');
      void Speech.stop().catch(() => {});
      finish();
    }, timeoutMs);
    const off = token.onCancel(() => {
      void Speech.stop().catch(() => {});
      finish(new CancelledError());
    });

    try {
      Speech.speak(text, {
        voice: device.voice,
        pitch: device.pitch,
        rate,
        language: device.voice ? undefined : 'en-US',
        useApplicationAudioSession: true,
        onDone: () => finish(),
        onStopped: () => finish(token.cancelled ? new CancelledError() : undefined),
        onError: (e) => {
          // A speech failure shouldn't stop practice; log and move on.
          console.warn('[tts] speech error', e);
          finish();
        },
      });
    } catch (err) {
      console.warn('[tts] speak threw', err);
      finish();
    }
  });
}

export function stopSpeaking() {
  void Speech.stop().catch(() => {});
  try {
    currentPlayer?.pause();
  } catch {
    // ignore
  }
}

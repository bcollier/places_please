import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { synthesizeSpeech } from '@/lib/ai';
import { Cancellation } from '@/lib/audio/cancel';
import { bytesToBase64, edgeSynthesize } from '@/lib/audio/edge-tts';
import { AppError, CancelledError } from '@/lib/errors';
import { countWords } from '@/lib/script-model';
import type { Gender, VoiceEngine } from '@/lib/types';

/**
 * Scene-partner voices.
 *
 * - Microsoft neural voices (free Edge Read Aloud voices, through the places-ai edge function):
 *   natural male and female voices. Each line is downloaded once and cached; the next lines are fetched ahead of time.
 * - The device's built-in voices: offline fallback. If Microsoft voices fail for any reason, the line
 *   is spoken with the device voice instead, so a rehearsal never stops.
 */

export type VoiceChoice = {
  /** Azure voice name, or null to use the device voice. */
  cloud: string | null;
  device: { voice?: string; pitch: number };
};

export type VoiceCast = {
  forCharacter: (name: string) => VoiceChoice;
  prompter: VoiceChoice;
};

// Microsoft neural voices available free through Edge Read Aloud, most natural and reliable first.
export const FEMALE_VOICES = [
  'en-US-AvaMultilingualNeural',
  'en-US-EmmaMultilingualNeural',
  'en-US-JennyNeural',
  'en-US-AriaNeural',
  'en-US-MichelleNeural',
  'en-GB-LibbyNeural',
  'en-GB-SoniaNeural',
];
export const MALE_VOICES = [
  'en-US-BrianMultilingualNeural',
  'en-US-AndrewMultilingualNeural',
  'en-US-GuyNeural',
  'en-US-ChristopherNeural',
  'en-GB-RyanNeural',
  'en-US-EricNeural',
  'en-US-RogerNeural',
  'en-GB-ThomasNeural',
];
const PROMPTER_VOICE = 'en-US-JennyNeural';

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
  // Free Microsoft voices need a connection only the phone app (or, in a browser, the local voice
  // helper) can make; otherwise use the browser's or phone's own voices.
  const useCloud = engine === 'microsoft' && (Platform.OS !== 'web' || (await voiceHelperAvailable()));
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
// Microsoft voices: fetch, cache, play
// ---------------------------------------------------------------------------

/** Set when Microsoft voices can't work this session (not allowed, or failing repeatedly). */
let cloudDisabled = false;
let consecutiveFailures = 0;

// Web only: the local voice helper (`npm run voices`) fetches Microsoft voices for the browser.
const VOICE_HELPER_URL = 'http://localhost:8790';
let helperCheck: Promise<boolean> | null = null;

function voiceHelperAvailable(): Promise<boolean> {
  if (Platform.OS !== 'web') return Promise.resolve(false);
  const host = globalThis.location?.hostname ?? '';
  if (host !== 'localhost' && host !== '127.0.0.1') return Promise.resolve(false);
  if (!helperCheck) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);
    helperCheck = fetch(`${VOICE_HELPER_URL}/health`, { signal: controller.signal })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => clearTimeout(timer));
  }
  return helperCheck;
}

async function fetchFromVoiceHelper(text: string, voice: string, rate: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(`${VOICE_HELPER_URL}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice, rate }),
      signal: controller.signal,
    });
    const body = (await res.json()) as { audio?: string };
    if (!res.ok || !body.audio) throw new Error(`voice helper HTTP ${res.status}`);
    return body.audio;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Gets MP3 audio as base64: straight from Microsoft on the phone (free Edge voices; refused from
 * cloud servers); in a browser through the local voice helper; otherwise through the places-ai
 * function (Azure backup).
 */
async function fetchAudioBase64(text: string, voice: string, rate: number): Promise<string> {
  if (Platform.OS === 'web') return fetchFromVoiceHelper(text, voice, rate);
  try {
    return bytesToBase64(await edgeSynthesize(text, voice, rate));
  } catch (err) {
    try {
      return bytesToBase64(await edgeSynthesize(text, voice, rate)); // one retry
    } catch {
      console.warn('[tts] Edge voice failed on device; trying the server', err);
    }
  }
  const { audio } = await synthesizeSpeech(text, voice, rate);
  return audio;
}
const audioCache = new Map<string, Promise<string>>();

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function cloudAudioUri(text: string, voice: string, rate: number): Promise<string> {
  const key = `${voice}|${rate}|${text}`;
  const cached = audioCache.get(key);
  if (cached) return cached;
  const promise = (async () => {
    const name = `tts-${hash(key)}-${text.length}.mp3`;
    if (Platform.OS !== 'web') {
      const file = new File(Paths.cache, name);
      if (file.exists) return file.uri;
      const audio = await fetchAudioBase64(text, voice, rate);
      file.create({ overwrite: true });
      await file.write(audio, { encoding: 'base64' });
      return file.uri;
    }
    const audio = await fetchAudioBase64(text, voice, rate);
    return `data:audio/mpeg;base64,${audio}`;
  })();
  audioCache.set(key, promise);
  promise.then(
    () => {
      consecutiveFailures = 0;
    },
    (err) => {
      audioCache.delete(key);
      consecutiveFailures++;
      // Stop waiting on Microsoft for the rest of the session if it clearly isn't working.
      if (
        consecutiveFailures >= 3 ||
        (err instanceof AppError && (err.code === 'tts_not_configured' || err.code === 'not_allowed'))
      ) {
        cloudDisabled = true;
      }
    },
  );
  return promise;
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
  if (!choice.cloud || cloudDisabled || !text.trim()) return;
  cloudAudioUri(text, choice.cloud, rate).catch(() => {});
}

// ---------------------------------------------------------------------------
// Speak
// ---------------------------------------------------------------------------

/**
 * Speaks text and resolves when finished. Rejects only with CancelledError.
 * Microsoft voice first (when chosen); any failure falls back to the device voice.
 */
export async function speak(text: string, choice: VoiceChoice, rate: number, token: Cancellation): Promise<void> {
  token.throwIfCancelled();
  const words = countWords(text);
  const timeoutMs = 6000 + (words / Math.max(0.5, rate)) * 700;

  if (choice.cloud && !cloudDisabled) {
    try {
      const uri = await cloudAudioUri(text, choice.cloud, rate);
      token.throwIfCancelled();
      await playUri(uri, timeoutMs, token);
      return;
    } catch (err) {
      if (err instanceof CancelledError) throw err;
      console.warn('[tts] Microsoft voice failed; using device voice', err);
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

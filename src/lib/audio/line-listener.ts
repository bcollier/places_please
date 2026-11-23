import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  type AudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { Platform } from 'react-native';

import { Cancellation } from '@/lib/audio/cancel';
import { browserRecordingToWavBase64 } from '@/lib/audio/to-wav';
import { deleteLocalFile, readUriAsBase64 } from '@/lib/file-base64';
import { AppError, CancelledError } from '@/lib/errors';
import type { PauseLength } from '@/lib/types';

/** 16 kHz mono 16-bit WAV: small, and accepted by every transcription model. */
export const SPEECH_RECORDING_OPTIONS: RecordingOptions = {
  extension: '.wav',
  sampleRate: 16000,
  numberOfChannels: 1,
  bitRate: 256000,
  isMeteringEnabled: true,
  ios: {
    extension: '.wav',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    sampleRate: 16000,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  android: {
    extension: '.m4a',
    outputFormat: 'mpeg4',
    audioEncoder: 'aac',
    sampleRate: 16000,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 64000 },
};

// iOS records WAV, web recordings are converted to WAV, Android records AAC in an .m4a file.
export const RECORDING_FORMAT: 'wav' | 'm4a' = Platform.OS === 'android' ? 'm4a' : 'wav';

export const PAUSE_MS: Record<PauseLength, number> = { short: 900, medium: 1500, long: 2400 };

export async function ensureMicPermission() {
  const res = await requestRecordingPermissionsAsync();
  if (!res.granted) {
    throw new AppError(
      'Microphone access is off. Turn it on in Settings › Places, Please so your scene partner can hear you.',
      'permission',
      false,
    );
  }
}

export type ListenResult = { uri: string | null; heardSpeech: boolean; durationMs: number };

export type ListenControls = {
  /** Set by the UI ("I'm done") to end the recording right away. */
  stopRequested: boolean;
};

type LevelCallback = (level: number, speaking: boolean) => void;

const POLL_INTERVAL_MS = 100;
const NO_SPEECH_TIMEOUT_MS = 8000;
/** The first readings are taken as the room's noise floor, before listening for speech. */
const FLOOR_CALIBRATION_MS = 350;

/** Hard cap on one recording, scaled to the line's length. */
function maxListenMs(expectedWords: number) {
  return Math.min(120_000, 6000 + expectedWords * 900);
}

/** How long to record when the device has no level meter. */
function fallbackListenMs(expectedWords: number) {
  return 2500 + expectedWords * 500;
}

function medianLevel(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : -60;
}

/** Speech is anything clearly above the noise floor, within sane bounds. */
function speechThreshold(floor: number) {
  return Math.min(-22, Math.max(-48, floor + 12));
}

function meteringLevel(recorder: AudioRecorder): number | null {
  const status = recorder.getStatus();
  return typeof status.metering === 'number' ? status.metering : null;
}

/** Voice-activity detection: fed one meter reading per poll, it decides when the actor has finished. */
class SpeechDetector {
  speechStarted = false;
  private floor: number | null = null;
  private floorSamples: number[] = [];
  private loudStreak = 0;
  private lastLoudAt = 0;
  private meteringSeen = false;

  constructor(
    private pauseMs: number,
    private fallbackMs: number,
    private onLevel?: LevelCallback,
  ) {}

  shouldStop(level: number | null, elapsed: number, now: number): boolean {
    if (level === null) return this.noMeteringTimedOut(elapsed);
    this.meteringSeen = true;

    if (elapsed < FLOOR_CALIBRATION_MS) {
      this.floorSamples.push(level);
      return false;
    }
    const floor = (this.floor ??= medianLevel(this.floorSamples));
    const loud = level > speechThreshold(floor);
    this.onLevel?.(level, loud);
    this.trackLoudness(level, loud, floor, now);

    if (!this.speechStarted) return elapsed > NO_SPEECH_TIMEOUT_MS;
    return now - this.lastLoudAt > this.pauseMs;
  }

  private noMeteringTimedOut(elapsed: number) {
    // No metering on this device: stop after a time based on the line's length.
    if (!this.meteringSeen && elapsed > this.fallbackMs) {
      this.speechStarted = true;
      return true;
    }
    return false;
  }

  private trackLoudness(level: number, loud: boolean, floor: number, now: number) {
    if (loud) {
      this.loudStreak += 1;
      this.lastLoudAt = now;
      if (this.loudStreak >= 2) this.speechStarted = true;
    } else {
      this.loudStreak = 0;
      // Slowly track the noise floor while quiet (e.g. walking into a noisier street).
      if (!this.speechStarted) this.floor = floor * 0.95 + level * 0.05;
    }
  }
}

/** Calls `isDone` every poll until it returns true. Rejects if cancelled or if `isDone` throws. */
function pollUntil(token: Cancellation, isDone: () => boolean): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const off = token.onCancel(() => {
      clearInterval(interval);
      reject(new CancelledError());
    });
    const interval = setInterval(() => {
      try {
        if (!isDone()) return;
        clearInterval(interval);
        off();
        resolve();
      } catch (err) {
        clearInterval(interval);
        off();
        reject(err);
      }
    }, POLL_INTERVAL_MS);
  });
}

async function stopRecorder(recorder: AudioRecorder) {
  try {
    await recorder.stop();
  } catch (err) {
    // Leaving the screen mid-line releases the recorder first; nothing left to stop.
    if (!/shared object/i.test(String(err))) console.warn('[listen] stop failed', err);
  }
}

/**
 * Records until the actor stops talking.
 * Uses the recorder's level meter with an adaptive noise floor so it works on a quiet stage or a
 * windy sidewalk. Falls back to a time limit if metering isn't available.
 */
export async function listenForLine(
  recorder: AudioRecorder,
  opts: {
    expectedWords: number;
    pauseMs: number;
    token: Cancellation;
    controls: ListenControls;
    onLevel?: LevelCallback;
  },
): Promise<ListenResult> {
  const { token, controls } = opts;
  token.throwIfCancelled();

  await recorder.prepareToRecordAsync();
  recorder.record();
  const started = Date.now();

  const maxMs = maxListenMs(opts.expectedWords);
  const detector = new SpeechDetector(opts.pauseMs, fallbackListenMs(opts.expectedWords), opts.onLevel);

  try {
    await pollUntil(token, () => {
      const now = Date.now();
      const elapsed = now - started;
      if (controls.stopRequested || elapsed > maxMs) return true;
      return detector.shouldStop(meteringLevel(recorder), elapsed, now);
    });
  } finally {
    await stopRecorder(recorder);
  }

  return {
    uri: recorder.uri ?? recorder.getStatus().url ?? null,
    heardSpeech: detector.speechStarted || controls.stopRequested,
    durationMs: Date.now() - started,
  };
}

export async function readRecordingBase64(uri: string): Promise<string> {
  try {
    // Browsers record WebM; convert to WAV so every transcription model accepts it.
    return Platform.OS === 'web' ? await browserRecordingToWavBase64(uri) : await readUriAsBase64(uri);
  } catch (err) {
    console.warn('[listen] read recording failed', err);
    throw new AppError("Couldn't read the recording.", 'recording');
  }
}

/** Recordings are deleted right after they're transcribed; nothing is kept on the device. */
export function deleteRecording(uri: string | null) {
  deleteLocalFile(uri);
}

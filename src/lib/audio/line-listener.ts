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
    onLevel?: (level: number, speaking: boolean) => void;
  },
): Promise<ListenResult> {
  const { token, controls } = opts;
  token.throwIfCancelled();

  await recorder.prepareToRecordAsync();
  recorder.record();
  const started = Date.now();

  const maxMs = Math.min(120_000, 6000 + opts.expectedWords * 900);
  const noSpeechTimeoutMs = 8000;
  const fallbackMs = 2500 + opts.expectedWords * 500;

  let floor: number | null = null;
  const floorSamples: number[] = [];
  let speechStarted = false;
  let loudStreak = 0;
  let lastLoudAt = 0;
  let meteringSeen = false;

  try {
    await new Promise<void>((resolve, reject) => {
      const off = token.onCancel(() => {
        clearInterval(interval);
        reject(new CancelledError());
      });
      const interval = setInterval(() => {
        try {
          const now = Date.now();
          const elapsed = now - started;
          const end = () => {
            clearInterval(interval);
            off();
            resolve();
          };

          if (controls.stopRequested) return end();
          if (elapsed > maxMs) return end();

          const status = recorder.getStatus();
          const level = typeof status.metering === 'number' ? status.metering : null;

          if (level === null) {
            // No metering on this device: stop after a time based on the line's length.
            if (!meteringSeen && elapsed > fallbackMs) {
              speechStarted = true;
              return end();
            }
            return;
          }
          meteringSeen = true;

          if (elapsed < 350) {
            floorSamples.push(level);
            return;
          }
          if (floor === null) {
            const sorted = [...floorSamples].sort((a, b) => a - b);
            floor = sorted.length ? sorted[Math.floor(sorted.length / 2)] : -60;
          }
          const threshold = Math.min(-22, Math.max(-48, floor + 12));
          const loud = level > threshold;
          opts.onLevel?.(level, loud);

          if (loud) {
            loudStreak += 1;
            lastLoudAt = now;
            if (loudStreak >= 2) speechStarted = true;
          } else {
            loudStreak = 0;
            // Slowly track the noise floor while quiet (e.g. walking into a noisier street).
            if (!speechStarted) floor = floor * 0.95 + level * 0.05;
          }

          if (!speechStarted && elapsed > noSpeechTimeoutMs) return end();
          if (speechStarted && now - lastLoudAt > opts.pauseMs) return end();
        } catch (err) {
          clearInterval(interval);
          off();
          reject(err);
        }
      }, 100);
    });
  } finally {
    try {
      await recorder.stop();
    } catch (err) {
      // Leaving the screen mid-line releases the recorder first; nothing left to stop.
      if (!/shared object/i.test(String(err))) console.warn('[listen] stop failed', err);
    }
  }

  return {
    uri: recorder.uri ?? recorder.getStatus().url ?? null,
    heardSpeech: speechStarted || controls.stopRequested,
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

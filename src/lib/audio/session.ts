import {
  createAudioPlayer,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  type AudioMode,
  type AudioPlayer,
} from 'expo-audio';
import { AppState, Platform } from 'react-native';

/**
 * Audio session management.
 *
 * Practicing "with the screen off while walking" needs:
 *  - UIBackgroundModes: audio (set by the expo-audio config plugin in app.json)
 *  - an audio session that stays active in the background
 *  - something always playing between lines, so iOS doesn't suspend the app while we wait on the
 *    network. A silent looping track does that (the "keep-alive").
 *  - a safety net for when something pauses playback anyway as the app leaves the screen (seen on a
 *    real iPhone in Expo Go, not in the simulator): see `resumeInBackground`.
 */

type SessionKind = 'practice' | 'listen' | 'idle';
let current: SessionKind = 'idle';
let keepAlive: AudioPlayer | null = null;

function audioModeFor(kind: Exclude<SessionKind, 'idle'>): Partial<AudioMode> {
  return {
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
    allowsRecording: kind === 'practice',
    allowsBackgroundRecording: kind === 'practice',
    shouldRouteThroughEarpiece: false,
  };
}

export async function configureAudioSession(kind: Exclude<SessionKind, 'idle'>) {
  // Always applied, never skipped as "already set": a stale setting here is what lets iOS stop the
  // audio when the app goes to the background.
  // expo-audio ignores every play() while audio is switched off, so always make sure it's on.
  await setIsAudioActiveAsync(true);
  await setAudioModeAsync(audioModeFor(kind));
  current = kind;
  watchForBackground();
}

/** Things to restart if they were paused as the app went to the background (the current voice line). */
const backgroundResumers = new Set<() => void>();

export function onBackgroundResume(resume: () => void) {
  backgroundResumers.add(resume);
}

let backgroundWatch: { remove(): void } | null = null;

function watchForBackground() {
  if (backgroundWatch || Platform.OS === 'web') return;
  backgroundWatch = AppState.addEventListener('change', (state) => {
    if (state === 'background' && current !== 'idle') void resumeInBackground(current);
  });
}

/**
 * Runs the moment the app leaves the screen during practice. iOS still gives the app a few seconds
 * here, so re-apply the background audio setting and restart anything that was paused. Once audio is
 * playing again, iOS keeps the app running.
 */
async function resumeInBackground(kind: Exclude<SessionKind, 'idle'>) {
  try {
    await setAudioModeAsync(audioModeFor(kind));
  } catch (err) {
    console.warn('[audio] background re-apply failed', err);
  }
  if (current !== kind) return; // the session ended meanwhile
  startKeepAlive();
  for (const resume of backgroundResumers) {
    try {
      resume();
    } catch (err) {
      console.warn('[audio] background resume failed', err);
    }
  }
}

export function startKeepAlive() {
  try {
    if (!keepAlive) {
      keepAlive = createAudioPlayer(require('@/assets/sounds/silence.wav'), { keepAudioSessionActive: true });
      keepAlive.loop = true;
      keepAlive.volume = 0.05;
    }
    keepAlive.play();
  } catch (err) {
    console.warn('[audio] keep-alive failed to start', err);
  }
}

export function stopKeepAlive() {
  try {
    keepAlive?.pause();
  } catch {
    // ignore
  }
}

/**
 * Ends the practice session and lets other apps' audio (music, podcasts) play alongside again.
 *
 * Don't call setIsAudioActiveAsync(false) here: in expo-audio that switches playback off for the
 * whole app until it's switched back on, which silenced every later voice preview and session.
 */
export async function releaseAudioSession() {
  stopKeepAlive();
  if (current === 'idle') return;
  current = 'idle';
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: false,
      allowsRecording: false,
      allowsBackgroundRecording: false,
      interruptionMode: 'mixWithOthers',
    });
  } catch (err) {
    console.warn('[audio] release failed', err);
  }
}

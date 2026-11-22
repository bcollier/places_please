import { createAudioPlayer, setAudioModeAsync, setIsAudioActiveAsync, type AudioPlayer } from 'expo-audio';

/**
 * Audio session management.
 *
 * Practicing "with the screen off while walking" needs:
 *  - UIBackgroundModes: audio (set by the expo-audio config plugin in app.json)
 *  - an audio session that stays active in the background
 *  - something always playing between lines, so iOS doesn't suspend the app while we wait on the
 *    network. A silent looping track does that (the "keep-alive").
 */

type SessionKind = 'practice' | 'listen' | 'idle';
let current: SessionKind = 'idle';
let keepAlive: AudioPlayer | null = null;

export async function configureAudioSession(kind: Exclude<SessionKind, 'idle'>) {
  if (current === kind) return;
  await setAudioModeAsync({
    playsInSilentMode: true,
    shouldPlayInBackground: true,
    interruptionMode: 'doNotMix',
    allowsRecording: kind === 'practice',
    allowsBackgroundRecording: kind === 'practice',
    shouldRouteThroughEarpiece: false,
  });
  current = kind;
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

/** Ends the practice session and lets other apps' audio (music, podcasts) resume. */
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
    await setIsAudioActiveAsync(false);
  } catch (err) {
    console.warn('[audio] release failed', err);
  }
}

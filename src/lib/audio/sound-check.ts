import { createAudioPlayer, type AudioSource } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { synthesizeSpeech } from '@/lib/ai';
import { configureAudioSession, releaseAudioSession } from '@/lib/audio/session';
import { cloudVoiceStatus, FEMALE_VOICES, resetCloudVoices } from '@/lib/audio/tts';

/**
 * Settings › Sound check: plays each kind of audio the app uses, one at a time, and reports what the
 * audio system actually did, so "I hear nothing" can be narrowed down on a real phone.
 */

export type CheckStep = { label: string; ok: boolean | null; detail: string };

type PlayResult = { finished: boolean; maxTime: number; duration: number; error: string | null };

function playAndWatch(source: AudioSource, timeoutMs: number): Promise<PlayResult> {
  return new Promise((resolve) => {
    const result: PlayResult = { finished: false, maxTime: 0, duration: 0, error: null };
    let player: ReturnType<typeof createAudioPlayer>;
    try {
      player = createAudioPlayer(source, { keepAudioSessionActive: true });
    } catch (err) {
      return resolve({ ...result, error: String(err) });
    }
    const done = () => {
      clearTimeout(timer);
      sub.remove();
      try {
        player.remove();
      } catch {
        // ignore
      }
      resolve(result);
    };
    const timer = setTimeout(done, timeoutMs);
    const sub = player.addListener('playbackStatusUpdate', (s) => {
      result.maxTime = Math.max(result.maxTime, s.currentTime || 0);
      result.duration = s.duration || result.duration;
      if (s.error) result.error = s.error;
      if (s.didJustFinish) {
        result.finished = true;
        done();
      }
    });
    player.play();
  });
}

const describe = (r: PlayResult) =>
  r.finished
    ? `Played to the end (${r.duration.toFixed(1)} s).`
    : r.error
      ? `Player error: ${r.error}`
      : `Didn't finish: reached ${r.maxTime.toFixed(1)} of ${r.duration.toFixed(1)} s.`;

export async function runSoundCheck(onStep: (steps: CheckStep[]) => void): Promise<void> {
  const steps: CheckStep[] = [];
  const push = (step: CheckStep) => {
    steps.push(step);
    onStep([...steps]);
  };
  const update = (step: Partial<CheckStep>) => {
    steps[steps.length - 1] = { ...steps[steps.length - 1], ...step };
    onStep([...steps]);
  };

  // 1. Audio session
  push({ label: 'Audio session', ok: null, detail: 'Setting up…' });
  try {
    await configureAudioSession('listen');
    update({ ok: true, detail: 'Ready (plays even with the silent switch on).' });
  } catch (err) {
    update({ ok: false, detail: `Couldn't set up audio: ${String(err)}` });
  }

  // 2. Built-in chime (no internet)
  push({ label: 'Chime (built in)', ok: null, detail: 'Playing… you should hear a chime.' });
  const chime = await playAndWatch(require('@/assets/sounds/perfect.wav'), 4000);
  update({ ok: chime.finished, detail: describe(chime) });

  // 3. ElevenLabs voice (internet, through the places-ai function)
  push({ label: 'ElevenLabs voice', ok: null, detail: 'Downloading…' });
  const wasOff = cloudVoiceStatus();
  resetCloudVoices(); // let the app try ElevenLabs again after this check
  try {
    const t0 = Date.now();
    const { audio } = await synthesizeSpeech('Places, please. This is the ElevenLabs voice.', FEMALE_VOICES[0], 1);
    const kb = Math.round((audio.length * 0.75) / 1024);
    update({ detail: `Downloaded ${kb} KB in ${Date.now() - t0} ms. Playing…` });
    let source: AudioSource;
    let file: File | null = null;
    if (Platform.OS === 'web') {
      source = { uri: `data:audio/mpeg;base64,${audio}` };
    } else {
      file = new File(Paths.cache, `sound-check-${Date.now()}.mp3`);
      file.create({ overwrite: true });
      await file.write(audio, { encoding: 'base64' });
      source = { uri: file.uri };
    }
    const voice = await playAndWatch(source, 10000);
    update({ ok: voice.finished, detail: `Downloaded in ${Date.now() - t0} ms. ${describe(voice)}` });
    try {
      file?.delete();
    } catch {
      // ignore
    }
  } catch (err) {
    update({
      ok: false,
      detail:
        `Couldn't get the voice: ${err instanceof Error ? err.message : String(err)}` +
        (err && typeof err === 'object' && 'code' in err ? ` (${String((err as { code: unknown }).code)})` : '') +
        '. The app will use the iPhone voice instead.' +
        (wasOff ? ` (ElevenLabs had been ${wasOff}.)` : ''),
    });
  }

  // 4. Phone's built-in voice
  push({ label: 'iPhone voice', ok: null, detail: 'Speaking…' });
  const spoken = await new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve('timed out'), 8000);
    try {
      Speech.speak('And this is the iPhone voice.', {
        useApplicationAudioSession: true,
        onDone: () => {
          clearTimeout(timer);
          resolve(null);
        },
        onError: (e) => {
          clearTimeout(timer);
          resolve(String(e));
        },
      });
    } catch (err) {
      clearTimeout(timer);
      resolve(String(err));
    }
  });
  update({ ok: spoken === null, detail: spoken === null ? 'Finished speaking.' : `Problem: ${spoken}` });

  await releaseAudioSession();
}

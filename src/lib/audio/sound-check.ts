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

/** Adds steps to the report and updates the latest one, sending a fresh copy of the list each time. */
type StepReporter = { push: (step: CheckStep) => void; update: (patch: Partial<CheckStep>) => void };

function createStepReporter(onStep: (steps: CheckStep[]) => void): StepReporter {
  const steps: CheckStep[] = [];
  return {
    push(step) {
      steps.push(step);
      onStep([...steps]);
    },
    update(patch) {
      steps[steps.length - 1] = { ...steps[steps.length - 1], ...patch };
      onStep([...steps]);
    },
  };
}

export async function runSoundCheck(onStep: (steps: CheckStep[]) => void): Promise<void> {
  const report = createStepReporter(onStep);
  await checkAudioSession(report);
  await checkBuiltInChime(report);
  await checkElevenLabsVoice(report);
  await checkDeviceVoice(report);
  await releaseAudioSession();
}

async function checkAudioSession(report: StepReporter) {
  report.push({ label: 'Audio session', ok: null, detail: 'Setting up…' });
  try {
    await configureAudioSession('listen');
    report.update({ ok: true, detail: 'Ready (plays even with the silent switch on).' });
  } catch (err) {
    report.update({ ok: false, detail: `Couldn't set up audio: ${String(err)}` });
  }
}

/** No internet needed. */
async function checkBuiltInChime(report: StepReporter) {
  report.push({ label: 'Chime (built in)', ok: null, detail: 'Playing… you should hear a chime.' });
  const chime = await playAndWatch(require('@/assets/sounds/perfect.wav'), 4000);
  report.update({ ok: chime.finished, detail: describe(chime) });
}

/** Needs internet: goes through the places-ai function. */
async function checkElevenLabsVoice(report: StepReporter) {
  report.push({ label: 'ElevenLabs voice', ok: null, detail: 'Downloading…' });
  const wasOff = cloudVoiceStatus();
  resetCloudVoices(); // let the app try ElevenLabs again after this check
  try {
    const t0 = Date.now();
    const { audio } = await synthesizeSpeech('Places, please. This is the ElevenLabs voice.', FEMALE_VOICES[0], 1);
    const kb = Math.round((audio.length * 0.75) / 1024);
    report.update({ detail: `Downloaded ${kb} KB in ${Date.now() - t0} ms. Playing…` });
    const { source, file } = await playableSource(audio);
    const voice = await playAndWatch(source, 10000);
    report.update({ ok: voice.finished, detail: `Downloaded in ${Date.now() - t0} ms. ${describe(voice)}` });
    try {
      file?.delete();
    } catch {
      // ignore
    }
  } catch (err) {
    report.update({ ok: false, detail: describeVoiceError(err, wasOff) });
  }
}

/** Base64 MP3 as something the player can open: a data URI on web, a temporary cache file on phones. */
async function playableSource(audio: string): Promise<{ source: AudioSource; file: File | null }> {
  if (Platform.OS === 'web') {
    return { source: { uri: `data:audio/mpeg;base64,${audio}` }, file: null };
  }
  const file = new File(Paths.cache, `sound-check-${Date.now()}.mp3`);
  file.create({ overwrite: true });
  await file.write(audio, { encoding: 'base64' });
  return { source: { uri: file.uri }, file };
}

function describeVoiceError(err: unknown, wasOff: string | null) {
  return (
    `Couldn't get the voice: ${err instanceof Error ? err.message : String(err)}` +
    (err && typeof err === 'object' && 'code' in err ? ` (${String((err as { code: unknown }).code)})` : '') +
    '. The app will use the iPhone voice instead.' +
    (wasOff ? ` (ElevenLabs had been ${wasOff}.)` : '')
  );
}

async function checkDeviceVoice(report: StepReporter) {
  report.push({ label: 'iPhone voice', ok: null, detail: 'Speaking…' });
  const problem = await speakWithDeviceVoice('And this is the iPhone voice.', 8000);
  report.update({ ok: problem === null, detail: problem === null ? 'Finished speaking.' : `Problem: ${problem}` });
}

/** Speaks with expo-speech; resolves to null when done, or a description of what went wrong. */
function speakWithDeviceVoice(text: string, timeoutMs: number): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve('timed out'), timeoutMs);
    try {
      Speech.speak(text, {
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
}

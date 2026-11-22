import type { AudioRecorder } from 'expo-audio';
import * as Haptics from 'expo-haptics';

import { transcribeAudio } from '@/lib/ai';
import { Cancellation, cancellableDelay } from '@/lib/audio/cancel';
import {
  deleteRecording,
  ensureMicPermission,
  listenForLine,
  PAUSE_MS,
  readRecordingBase64,
  RECORDING_FORMAT,
  type ListenControls,
} from '@/lib/audio/line-listener';
import { configureAudioSession, releaseAudioSession, startKeepAlive } from '@/lib/audio/session';
import { playSound, preloadSounds } from '@/lib/audio/sfx';
import { castVoices, prefetchSpeech, speak, stopSpeaking, type VoiceCast } from '@/lib/audio/tts';
import { AppError, CancelledError, isCancelled, toUserMessage, withRetry } from '@/lib/errors';
import { countWords, uniqueCharacters } from '@/lib/script-model';
import { scoreLine, type LineScore } from '@/lib/scoring';
import type { Gender, LineAttempt, ScriptLine, Settings } from '@/lib/types';

/**
 * Run Lines: the AI partner reads every other character's lines aloud, then listens while the actor
 * says theirs, checks it word-for-word, and plays a sound for perfect / close / missed.
 * Runs entirely from audio so it works with the screen off.
 */

export type RunnerPhase =
  | 'idle'
  | 'preparing'
  | 'partner'
  | 'listening'
  | 'checking'
  | 'feedback'
  | 'prompting'
  | 'review'
  | 'paused'
  | 'finished'
  | 'error';

export type LastResult = {
  lineId: string;
  verdict: LineAttempt['verdict'];
  score: LineScore | null;
  transcript: string;
  note?: string;
};

export type RunnerState = {
  phase: RunnerPhase;
  index: number;
  speaking: boolean;
  last: LastResult | null;
  attempts: LineAttempt[];
  error: string | null;
  /** 'not_allowed' when the AI needs the user to sign in first. */
  errorCode: string | null;
  /** Live microphone level while listening, 0 (silence) to 1 (loud). */
  level: number;
};

class SkipCheckSignal extends Error {}

type Listener = (state: RunnerState) => void;

export class LineRunner {
  private state: RunnerState = { phase: 'idle', index: 0, speaking: false, last: null, attempts: [], error: null, errorCode: null, level: 0 };
  private listeners = new Set<Listener>();
  private token: Cancellation | null = null;
  private controls: ListenControls = { stopRequested: false };
  private voices: VoiceCast | null = null;
  private recast = false;
  private forcePromptIndex: number | null = null;
  private decide: ((choice: 'retry' | 'continue') => void) | null = null;
  private skipCheck: (() => void) | null = null;

  constructor(
    private lines: ScriptLine[],
    private me: string,
    private recorder: AudioRecorder,
    private settings: Settings,
    private genders: Record<string, Gender> = {},
  ) {}

  /** New voice casting (e.g. genders just guessed); takes effect at the next start. */
  updateGenders(genders: Record<string, Gender>) {
    this.genders = genders;
    this.recast = true; // keep the current voices until the next start, never mid-line
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  getState() {
    return this.state;
  }

  private set(patch: Partial<RunnerState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  get myLineCount() {
    return this.lines.filter((l) => l.character === this.me).length;
  }

  async start(fromIndex = 0) {
    this.cancelCurrent();
    const token = new Cancellation();
    this.token = token;
    this.set({ phase: 'preparing', index: fromIndex, error: null, errorCode: null });
    try {
      await ensureMicPermission();
      await configureAudioSession('practice');
      preloadSounds();
      startKeepAlive();
      if (!this.voices || this.recast) {
        this.recast = false;
        this.voices = await castVoices({
          characters: uniqueCharacters(this.lines),
          me: this.me,
          genders: this.genders,
          engine: this.settings.voiceEngine,
        });
      }
      await this.loop(token);
    } catch (err) {
      if (isCancelled(err)) return;
      console.warn('[runner] stopped with error', err);
      this.cancelCurrent();
      // Don't leave the background (recording-capable) session and silent keep-alive running.
      await releaseAudioSession();
      this.set({ phase: 'error', error: toUserMessage(err), errorCode: err instanceof AppError ? err.code : null });
    }
  }

  /** Fresh run from the top (clears this run's results). */
  restart() {
    this.cancelCurrent();
    this.set({ attempts: [], last: null, index: 0 });
    void this.start(0);
  }

  pause() {
    if (this.state.phase === 'finished' || this.state.phase === 'idle') return;
    this.cancelCurrent();
    this.set({ phase: 'paused', speaking: false });
  }

  resume() {
    void this.start(this.state.index);
  }

  /** After a mistake: hear the cue again and have another go at the line. */
  tryAgain() {
    this.decide?.('retry');
  }

  /** After a mistake: move on to the next line. */
  keepGoing() {
    this.decide?.('continue');
  }

  /** Checking is taking too long: move on without a verdict for this line. */
  skipChecking() {
    this.skipCheck?.();
  }

  /** "I'm done": end the recording now instead of waiting for silence. */
  doneSpeaking() {
    this.controls.stopRequested = true;
  }

  /** "Line!": hear the line, counts as missed. */
  callForLine() {
    if (this.state.phase !== 'listening') return;
    this.forcePromptIndex = this.state.index;
    this.controls.stopRequested = true;
  }

  /** Jump to a line (restarts from there). */
  jumpTo(index: number) {
    const clamped = Math.max(0, Math.min(this.lines.length - 1, index));
    this.cancelCurrent();
    void this.start(clamped);
  }

  async stop() {
    this.cancelCurrent();
    await releaseAudioSession();
  }

  private cancelCurrent() {
    this.token?.cancel();
    this.token = null;
    stopSpeaking();
    this.controls.stopRequested = true;
    try {
      if (this.recorder.isRecording) void this.recorder.stop().catch(() => {});
    } catch {
      // ignore
    }
  }

  private recordAttempt(attempt: LineAttempt) {
    // Re-running a line replaces the previous attempt at it.
    const attempts = this.state.attempts.filter((a) => a.lineId !== attempt.lineId);
    attempts.push(attempt);
    this.set({ attempts });
  }

  private async loop(token: Cancellation) {
    const rate = this.settings.speechRate;
    for (let i = this.state.index; i < this.lines.length; i++) {
      token.throwIfCancelled();
      const line = this.lines[i];
      this.set({ index: i });
      this.prefetchAfter(i);

      if (line.character !== this.me) {
        this.set({ phase: 'partner', speaking: true });
        await speak(line.text, this.voices!.forCharacter(line.character), rate, token);
        this.set({ speaking: false });
        continue;
      }

      const verdict = await this.runMyLine(line, i, token);
      const mistake = verdict === 'missed' || verdict === 'close';
      const pauseHere =
        mistake && (this.settings.pauseOnMistake === 'all' || (this.settings.pauseOnMistake === 'missed' && verdict === 'missed'));

      if (pauseHere) {
        const choice = await this.waitForDecision(token);
        if (choice === 'retry') {
          // Replay the partner's cue (if there is one) and try the line again.
          const cue = i > 0 && this.lines[i - 1].character !== this.me ? i - 1 : i;
          i = cue - 1; // the loop's i++ lands on the cue
          continue;
        }
      } else {
        // Hands-free: leave a moment to take in a mistake before moving on.
        await cancellableDelay(mistake ? 1200 : 350, token);
      }
    }

    this.set({ phase: 'finished', speaking: false });
    await releaseAudioSession();
  }

  /** Download the next couple of partner lines while this one plays, so there's no gap. */
  private prefetchAfter(index: number) {
    if (!this.voices) return;
    let found = 0;
    for (let j = index + 1; j < this.lines.length && found < 2; j++) {
      const next = this.lines[j];
      if (next.character === this.me) continue;
      prefetchSpeech(next.text, this.voices.forCharacter(next.character), this.settings.speechRate);
      found++;
    }
  }

  private waitForDecision(token: Cancellation): Promise<'retry' | 'continue'> {
    this.set({ phase: 'review', speaking: false });
    return new Promise((resolve, reject) => {
      const off = token.onCancel(() => {
        this.decide = null;
        reject(new CancelledError());
      });
      this.decide = (choice) => {
        this.decide = null;
        off();
        resolve(choice);
      };
    });
  }

  private async runMyLine(line: ScriptLine, index: number, token: Cancellation): Promise<LineAttempt['verdict']> {
    const rate = this.settings.speechRate;
    this.controls = { stopRequested: false };
    this.forcePromptIndex = null;

    if (this.settings.cueSound) await playSound('cue');
    token.throwIfCancelled();

    this.set({ phase: 'listening', last: null, level: 0 });
    let recording;
    try {
      recording = await listenForLine(this.recorder, {
        expectedWords: countWords(line.text),
        pauseMs: PAUSE_MS[this.settings.pauseLength],
        token,
        controls: this.controls,
        // dBFS (about -60 quiet room, -10 loud voice) to 0..1 for the on-screen voice meter.
        onLevel: (db) => this.set({ level: Math.max(0, Math.min(1, (db + 58) / 45)) }),
      });
    } finally {
      this.set({ level: 0 });
    }
    token.throwIfCancelled();

    const calledForLine = this.forcePromptIndex === index;
    let result: LastResult;

    if (calledForLine || !recording.heardSpeech || !recording.uri) {
      deleteRecording(recording.uri);
      result = {
        lineId: line.id,
        verdict: 'missed',
        score: scoreLine(line.text, ''),
        transcript: '',
        note: calledForLine ? 'You called for the line.' : "Didn't hear anything.",
      };
    } else {
      this.set({ phase: 'checking' });
      try {
        const base64 = await readRecordingBase64(recording.uri);
        const vocabulary = uniqueCharacters(this.lines).map((c) => c[0] + c.slice(1).toLowerCase());
        const skipped = new Promise<never>((_, reject) => {
          this.skipCheck = () => reject(new SkipCheckSignal());
        });
        const { transcript } = await Promise.race([
          withRetry(() => transcribeAudio(base64, RECORDING_FORMAT, vocabulary), 2, 700),
          skipped,
        ]);
        this.skipCheck = null;
        token.throwIfCancelled();
        const score = scoreLine(line.text, transcript);
        result = { lineId: line.id, verdict: score.verdict, score, transcript };
      } catch (err) {
        this.skipCheck = null;
        if (isCancelled(err)) throw err;
        if (err instanceof AppError && err.code === 'not_allowed') throw err;
        if (err instanceof SkipCheckSignal) {
          deleteRecording(recording.uri);
          this.recordAttempt({ lineId: line.id, verdict: 'skipped', accuracy: 0, transcript: '' });
          this.set({ phase: 'feedback', last: { lineId: line.id, verdict: 'skipped', score: null, transcript: '', note: 'Skipped checking this line.' } });
          return 'skipped';
        }
        // Don't punish the actor for a network hiccup: mark skipped, give the line, keep going.
        console.warn('[runner] transcription failed', err);
        result = {
          lineId: line.id,
          verdict: 'skipped',
          score: null,
          transcript: '',
          note: `Couldn't check that line. ${toUserMessage(err)}`,
        };
      } finally {
        deleteRecording(recording.uri);
      }
    }

    this.recordAttempt({
      lineId: line.id,
      verdict: result.verdict,
      accuracy: result.score?.accuracy ?? 0,
      transcript: result.transcript,
    });
    this.set({ phase: 'feedback', last: result });

    if (result.verdict === 'perfect') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await playSound('perfect');
    } else if (result.verdict === 'close') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      await playSound('close');
    } else if (result.verdict === 'missed') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      await playSound('miss');
    }
    token.throwIfCancelled();

    const shouldPrompt =
      result.verdict === 'skipped' || calledForLine || (result.verdict === 'missed' && this.settings.promptOnMiss);
    if (shouldPrompt) {
      this.set({ phase: 'prompting', speaking: true });
      await speak(line.text, this.voices!.prompter, rate, token);
      this.set({ speaking: false });
    }
    return result.verdict;
  }
}

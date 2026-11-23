import { Cancellation, cancellableDelay } from '@/lib/audio/cancel';
import { configureAudioSession, releaseAudioSession, startKeepAlive } from '@/lib/audio/session';
import { castVoices, prefetchSpeech, speak, stopSpeaking, type VoiceCast } from '@/lib/audio/tts';
import { isCancelled, toUserMessage } from '@/lib/errors';
import { countWords, uniqueCharacters } from '@/lib/script-model';
import type { Gender, ScriptLine, Settings } from '@/lib/types';

/**
 * Listen mode: reads the scene aloud with a different voice for each character.
 * Optionally leaves a silent gap for the actor's own lines so they can say them along.
 */

export type ListenPhase = 'idle' | 'playing' | 'paused' | 'finished' | 'error';
export type ListenState = { phase: ListenPhase; index: number; error: string | null; gap: boolean };

export class ListenPlayer {
  private state: ListenState = { phase: 'idle', index: 0, error: null, gap: false };
  private listeners = new Set<(s: ListenState) => void>();
  private token: Cancellation | null = null;
  private voices: VoiceCast | null = null;
  /** Lines played (or left as a gap for you) to the end, for practice history. */
  private heard = new Set<number>();
  private recast = false;

  constructor(
    private lines: ScriptLine[],
    private me: string | null,
    private settings: Settings,
    private genders: Record<string, Gender> = {},
  ) {}

  /** New voice casting (e.g. genders just guessed); takes effect at the next start. */
  updateGenders(genders: Record<string, Gender>) {
    this.genders = genders;
    this.recast = true; // keep the current voices until the next start, never mid-line
  }

  subscribe(fn: (s: ListenState) => void) {
    this.listeners.add(fn);
    fn(this.state);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private set(patch: Partial<ListenState>) {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state);
  }

  /** Takes effect from the next line. */
  updateSettings(patch: Partial<Settings>) {
    this.settings = { ...this.settings, ...patch };
  }

  getState() {
    return this.state;
  }

  /** Number of different lines heard all the way through in this session. */
  heardCount() {
    return this.heard.size;
  }

  async play(fromIndex = this.state.phase === 'finished' ? 0 : this.state.index) {
    this.cancel();
    const token = new Cancellation();
    this.token = token;
    this.set({ phase: 'playing', index: fromIndex, error: null });
    try {
      await configureAudioSession('listen');
      startKeepAlive();
      const voices = await this.currentVoices();
      for (let i = fromIndex; i < this.lines.length; i++) {
        token.throwIfCancelled();
        this.set({ index: i, gap: false });
        this.prefetchAfter(i, voices);
        await this.performLine(this.lines[i], voices, token);
        this.heard.add(i);
        await cancellableDelay(250, token);
      }
      this.set({ phase: 'finished', gap: false });
      await releaseAudioSession();
    } catch (err) {
      if (isCancelled(err)) return;
      await this.fail(err);
    }
  }

  /** Casts voices on the first play, and again after the genders change. */
  private async currentVoices(): Promise<VoiceCast> {
    if (!this.voices || this.recast) {
      this.recast = false;
      this.voices = await castVoices({
        characters: uniqueCharacters(this.lines),
        me: this.me,
        genders: this.genders,
        engine: this.settings.voiceEngine,
      });
    }
    return this.voices;
  }

  /** Starts downloading the next two lines that will be spoken, so they play without a pause. */
  private prefetchAfter(index: number, voices: VoiceCast) {
    for (const next of this.lines.slice(index + 1, index + 3)) {
      if (this.isSpoken(next)) {
        prefetchSpeech(next.text, voices.forCharacter(next.character), this.settings.speechRate);
      }
    }
  }

  /** Speaks the line, or stays silent long enough for the actor to say their own line. */
  private async performLine(line: ScriptLine, voices: VoiceCast, token: Cancellation) {
    if (this.isSpoken(line)) {
      await speak(line.text, voices.forCharacter(line.character), this.settings.speechRate, token);
    } else {
      this.set({ gap: true });
      await cancellableDelay(gapDuration(line.text, this.settings.speechRate), token);
    }
  }

  private isSpoken(line: ScriptLine) {
    return line.character !== this.me || this.settings.listenReadsMyLines;
  }

  private async fail(err: unknown) {
    console.warn('[listen] error', err);
    this.cancel();
    await releaseAudioSession();
    this.set({ phase: 'error', error: toUserMessage(err) });
  }

  pause() {
    this.cancel();
    this.set({ phase: 'paused', gap: false });
  }

  skip(delta: number) {
    const next = Math.max(0, Math.min(this.lines.length - 1, this.state.index + delta));
    if (this.state.phase === 'playing') void this.play(next);
    else this.set({ index: next, phase: this.state.phase === 'finished' ? 'paused' : this.state.phase });
  }

  async stop() {
    this.cancel();
    await releaseAudioSession();
  }

  private cancel() {
    this.token?.cancel();
    this.token = null;
    stopSpeaking();
  }
}

/** How long to stay silent for the actor's own line: a beat, plus time to say each word at this rate. */
function gapDuration(text: string, speechRate: number) {
  return 1200 + (countWords(text) * 420) / speechRate;
}

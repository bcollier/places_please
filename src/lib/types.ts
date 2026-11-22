export type ScriptLine = {
  id: string;
  character: string;
  text: string;
  scene: string | null;
};

export type ScriptSource = 'photos' | 'pdf' | 'docx' | 'text';

export type Gender = 'female' | 'male' | 'unknown';

export type VoiceEngine = 'microsoft' | 'device';

export type Script = {
  id: string;
  title: string;
  my_character: string | null;
  characters: string[];
  /** Voice casting: which characters get a woman's or a man's voice. */
  character_genders: Record<string, Gender>;
  lines: ScriptLine[];
  source_type: ScriptSource;
  last_practiced_at: string | null;
  created_at: string;
  updated_at: string;
};

export type PracticeMode = 'run_lines' | 'warmup' | 'listen';

export type LineVerdict = 'perfect' | 'close' | 'missed' | 'skipped';

export type LineAttempt = {
  lineId: string;
  verdict: LineVerdict;
  accuracy: number;
  transcript?: string;
};

export type PracticeSession = {
  id: string;
  script_id: string | null;
  mode: PracticeMode;
  character: string | null;
  scene: string | null;
  started_at: string;
  ended_at: string;
  duration_seconds: number;
  lines_total: number;
  perfect_count: number;
  close_count: number;
  missed_count: number;
  score: number | null;
  details: LineAttempt[];
};

export type PauseLength = 'short' | 'medium' | 'long';

/** When Run Lines stops for 'Try again / Keep going' after a mistake. */
export type PauseOnMistake = 'all' | 'missed' | 'never';

export type Settings = {
  /** Microsoft neural voices (natural, needs internet) or the device's built-in voices. */
  voiceEngine: VoiceEngine;
  /** expo-speech rate; 1 is normal speed. */
  speechRate: number;
  /** How long a silence ends your line in Run Lines. */
  pauseLength: PauseLength;
  /** Stop after a mistake and wait for Try again / Keep going. */
  pauseOnMistake: PauseOnMistake;
  /** Read the correct line aloud after a miss. */
  promptOnMiss: boolean;
  /** Play the tick sound when the mic opens. */
  cueSound: boolean;
  /** In Listen mode, read my lines too (otherwise leave a pause to say them). */
  listenReadsMyLines: boolean;
  /** Guest chose "Not now" on the save-your-account prompt. */
  accountPromptDismissed: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  voiceEngine: 'microsoft',
  speechRate: 1,
  pauseLength: 'medium',
  pauseOnMistake: 'all',
  promptOnMiss: true,
  cueSound: true,
  listenReadsMyLines: true,
  accountPromptDismissed: false,
};

export type AiUsageSummary = {
  calls: number;
  costUsd: number;
  todayCostUsd: number;
};

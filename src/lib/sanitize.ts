import { DEFAULT_SETTINGS, type Gender, type Settings } from '@/lib/types';

/**
 * Validation for data that comes from outside the app's control: Supabase rows and the on-device
 * AsyncStorage copy. Anything unknown or out of range falls back to a safe default, so screens and
 * audio code can trust these values (e.g. PAUSE_MS[settings.pauseLength]).
 */

export function sanitizeSettings(value: unknown): Settings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof Settings, unknown>>;
  const rate = Number(v.speechRate);
  return {
    voiceEngine: v.voiceEngine === 'device' ? 'device' : 'elevenlabs',
    speechRate: Number.isFinite(rate) && rate >= 0.5 && rate <= 1.5 ? rate : DEFAULT_SETTINGS.speechRate,
    pauseLength: v.pauseLength === 'short' || v.pauseLength === 'long' ? v.pauseLength : 'medium',
    pauseOnMistake: v.pauseOnMistake === 'missed' || v.pauseOnMistake === 'never' ? v.pauseOnMistake : 'all',
    promptOnMiss: typeof v.promptOnMiss === 'boolean' ? v.promptOnMiss : DEFAULT_SETTINGS.promptOnMiss,
    cueSound: typeof v.cueSound === 'boolean' ? v.cueSound : DEFAULT_SETTINGS.cueSound,
    listenReadsMyLines:
      typeof v.listenReadsMyLines === 'boolean' ? v.listenReadsMyLines : DEFAULT_SETTINGS.listenReadsMyLines,
    accountPromptDismissed: v.accountPromptDismissed === true,
  };
}

export function sanitizeGenders(value: unknown): Record<string, Gender> {
  const out: Record<string, Gender> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [name, g] of Object.entries(value as Record<string, unknown>)) {
    if (g === 'female' || g === 'male') out[name] = g;
  }
  return out;
}

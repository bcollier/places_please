import AsyncStorage from '@react-native-async-storage/async-storage';

import { sanitizeGenders } from '@/lib/api';
import { DEFAULT_SETTINGS, type Script, type Settings } from '@/lib/types';

/**
 * On-device copy of the user's scripts, settings and current script (AsyncStorage).
 *
 * Supabase is the source of truth, but this copy survives closing and reopening the app: on launch
 * the home screen shows it immediately (even offline), then refreshes from Supabase. Every change is
 * written back here. Data is kept per user, so signing in to another account never shows the
 * previous account's scripts.
 */

type LocalSnapshot = {
  scripts: Script[];
  settings: Settings;
  currentScriptId: string | null;
  savedAt: string;
};

const VERSION = 1;
const keyFor = (userId: string) => `places-please:v${VERSION}:${userId}`;

export async function loadLocalSnapshot(userId: string): Promise<LocalSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LocalSnapshot>;
    if (!Array.isArray(parsed.scripts)) return null;
    return {
      scripts: parsed.scripts
        .filter((s): s is Script => !!s && typeof s === 'object' && typeof (s as Script).id === 'string')
        .map((s) => ({
          ...s,
          lines: Array.isArray(s.lines) ? s.lines : [],
          characters: Array.isArray(s.characters) ? s.characters : [],
          character_genders: sanitizeGenders(s.character_genders),
        })),
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) },
      currentScriptId: typeof parsed.currentScriptId === 'string' ? parsed.currentScriptId : null,
      savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : '',
    };
  } catch (err) {
    // A corrupt or unreadable copy is just ignored; Supabase still has everything.
    console.warn('[local-store] read failed', err);
    return null;
  }
}

export async function saveLocalSnapshot(
  userId: string,
  data: { scripts: Script[]; settings: Settings; currentScriptId: string | null },
): Promise<void> {
  try {
    const snapshot: LocalSnapshot = { ...data, savedAt: new Date().toISOString() };
    await AsyncStorage.setItem(keyFor(userId), JSON.stringify(snapshot));
  } catch (err) {
    console.warn('[local-store] write failed', err);
  }
}

export async function clearLocalSnapshot(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(userId));
  } catch {
    // ignore
  }
}

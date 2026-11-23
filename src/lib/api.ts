import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js';

import { AppError, withRetry } from '@/lib/errors';
import { sanitizeGenders, sanitizeSettings } from '@/lib/sanitize';
import { getSupabase } from '@/lib/supabase';
import {
  DEFAULT_SETTINGS,
  type AiUsageSummary,
  type LineAttempt,
  type PracticeMode,
  type PracticeSession,
  type Script,
  type ScriptLine,
  type Gender,
  type ScriptSource,
  type Settings,
} from '@/lib/types';

/** All database access goes through here. Row level security restricts every query to the signed-in user. */

const SCRIPT_COLUMNS =
  'id,title,my_character,characters,character_genders,lines,source_type,last_practiced_at,created_at,updated_at';

function dbError(error: PostgrestError | null, action: string): never {
  console.warn(`[api] ${action} failed`, error?.code, error?.message);
  throw new AppError(`Couldn't ${action}. Check your connection and try again.`, error?.code ?? 'db_error');
}

function sanitizeLines(value: unknown): ScriptLine[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .map((l, i) => ({
      id: typeof l.id === 'string' && l.id ? l.id : `l_${i}`,
      character: String(l.character ?? '').trim(),
      text: String(l.text ?? '').trim(),
      scene: typeof l.scene === 'string' && l.scene ? l.scene : null,
    }))
    .filter((l) => l.character && l.text);
}


function toScript(row: Record<string, unknown>): Script {
  const lines = sanitizeLines(row.lines);
  return {
    id: String(row.id),
    title: String(row.title ?? 'Untitled'),
    my_character: typeof row.my_character === 'string' ? row.my_character : null,
    characters: Array.isArray(row.characters) ? (row.characters as string[]) : [],
    character_genders: sanitizeGenders(row.character_genders),
    lines,
    source_type: (row.source_type as ScriptSource) ?? 'text',
    last_practiced_at: (row.last_practiced_at as string | null) ?? null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

// ---------------------------------------------------------------------------
// Scripts
// ---------------------------------------------------------------------------

export async function listScripts(): Promise<Script[]> {
  return withRetry(async () => {
    const { data, error } = await getSupabase()
      .from('places_scripts')
      .select(SCRIPT_COLUMNS)
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) dbError(error, 'load your scripts');
    return (data ?? []).map(toScript);
  });
}

export async function createScript(input: {
  title: string;
  lines: ScriptLine[];
  characters: string[];
  character_genders?: Record<string, Gender>;
  my_character: string | null;
  source_type: ScriptSource;
}): Promise<Script> {
  const { data, error } = await getSupabase()
    .from('places_scripts')
    .insert({
      title: input.title.trim().slice(0, 200) || 'Untitled script',
      lines: input.lines,
      characters: input.characters,
      character_genders: input.character_genders ?? {},
      my_character: input.my_character,
      source_type: input.source_type,
    })
    .select(SCRIPT_COLUMNS)
    .single();
  if (error || !data) dbError(error, 'save your script');
  return toScript(data);
}

export async function updateScript(
  id: string,
  patch: Partial<Pick<Script, 'title' | 'lines' | 'characters' | 'character_genders' | 'my_character' | 'last_practiced_at'>>,
): Promise<Script> {
  return withRetry(async () => {
    const { data, error } = await getSupabase()
      .from('places_scripts')
      .update(patch)
      .eq('id', id)
      .select(SCRIPT_COLUMNS)
      .single();
    if (error || !data) dbError(error, 'save your changes');
    return toScript(data);
  });
}

export async function deleteScript(id: string): Promise<void> {
  const { error } = await getSupabase().from('places_scripts').delete().eq('id', id);
  if (error) dbError(error, 'delete the script');
}

// ---------------------------------------------------------------------------
// Profile & settings
// ---------------------------------------------------------------------------

export type Profile = { settings: Settings; current_script_id: string | null };


export async function getProfile(userId: string): Promise<Profile> {
  return withRetry(async () => {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('places_profiles')
      .select('settings,current_script_id')
      .eq('id', userId)
      .maybeSingle();
    if (error) dbError(error, 'load your settings');
    if (!data) {
      // The signup trigger normally creates this; create it here if it's missing.
      const { error: insertError } = await supabase.from('places_profiles').upsert({ id: userId }, { onConflict: 'id' });
      if (insertError) dbError(insertError, 'set up your profile');
      return { settings: DEFAULT_SETTINGS, current_script_id: null };
    }
    return { settings: sanitizeSettings(data.settings), current_script_id: data.current_script_id ?? null };
  });
}

export async function updateProfile(
  userId: string,
  patch: { settings?: Settings; current_script_id?: string | null },
): Promise<void> {
  return withRetry(async () => {
    // Upsert: the profile row is created by the app (no auth trigger in the shared project).
    const { error } = await getSupabase().from('places_profiles').upsert({ id: userId, ...patch }, { onConflict: 'id' });
    if (error) dbError(error, 'save your settings');
  });
}

// ---------------------------------------------------------------------------
// Practice history
// ---------------------------------------------------------------------------

export type NewPracticeSession = {
  script_id: string;
  mode: PracticeMode;
  character: string | null;
  scene: string | null;
  started_at: Date;
  attempts: LineAttempt[];
  lines_total: number;
};

export function summarizeAttempts(attempts: LineAttempt[]) {
  const perfect = attempts.filter((a) => a.verdict === 'perfect').length;
  const close = attempts.filter((a) => a.verdict === 'close').length;
  const missed = attempts.filter((a) => a.verdict === 'missed').length;
  const scored = perfect + close + missed;
  const score = scored > 0 ? Math.round(((perfect + close * 0.5) / scored) * 100) : null;
  return { perfect, close, missed, score };
}

export async function savePracticeSession(session: NewPracticeSession): Promise<void> {
  const ended = new Date();
  const summary = summarizeAttempts(session.attempts);
  await withRetry(async () => {
    const { error } = await getSupabase()
      .from('places_practice_history')
      .insert(toPracticeHistoryRow(session, summary, ended));
    if (error) dbError(error, 'save this practice session');
  });
  await touchLastPracticed(session.script_id, ended);
}

function toPracticeHistoryRow(
  session: NewPracticeSession,
  { perfect, close, missed, score }: ReturnType<typeof summarizeAttempts>,
  ended: Date,
) {
  return {
    script_id: session.script_id,
    mode: session.mode,
    character: session.character,
    scene: session.scene,
    started_at: session.started_at.toISOString(),
    ended_at: ended.toISOString(),
    duration_seconds: Math.max(0, Math.round((ended.getTime() - session.started_at.getTime()) / 1000)),
    lines_total: session.lines_total,
    perfect_count: perfect,
    close_count: close,
    missed_count: missed,
    score,
    details: toAttemptDetails(session.attempts),
  };
}

/** Transcripts are only kept for missed/close lines, and trimmed. */
function toAttemptDetails(attempts: LineAttempt[]) {
  return attempts.slice(0, 500).map((a) => ({
    lineId: a.lineId,
    verdict: a.verdict,
    accuracy: Math.round(a.accuracy * 100) / 100,
    ...(a.transcript && a.verdict !== 'perfect' ? { transcript: a.transcript.slice(0, 500) } : {}),
  }));
}

/** Best effort: keeps the script's "last practiced" fresh for the home screen. */
async function touchLastPracticed(scriptId: string, at: Date) {
  try {
    await getSupabase().from('places_scripts').update({ last_practiced_at: at.toISOString() }).eq('id', scriptId);
  } catch {
    // not critical
  }
}

export async function listPracticeHistory(limit = 100): Promise<PracticeSession[]> {
  return withRetry(async () => {
    const { data, error } = await getSupabase()
      .from('places_practice_history')
      .select(
        'id,script_id,mode,character,scene,started_at,ended_at,duration_seconds,lines_total,perfect_count,close_count,missed_count,score,details',
      )
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) dbError(error, 'load your practice history');
    return (data ?? []).map((r) => ({
      ...(r as PracticeSession),
      score: r.score === null ? null : Number(r.score),
      details: Array.isArray(r.details) ? (r.details as LineAttempt[]) : [],
    }));
  });
}

// ---------------------------------------------------------------------------
// AI usage (read-only; rows are written by the edge function)
// ---------------------------------------------------------------------------

export async function getAiUsageSummary(): Promise<AiUsageSummary> {
  return withRetry(async () => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const { data, error } = await getSupabase()
      .from('places_ai_calls')
      .select('cost_usd,created_at')
      .gte('created_at', since.toISOString())
      .limit(10_000);
    if (error) dbError(error, 'load AI usage');
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    let costUsd = 0;
    let todayCostUsd = 0;
    for (const row of data ?? []) {
      const c = Number(row.cost_usd) || 0;
      costUsd += c;
      if (new Date(row.created_at) >= todayStart) todayCostUsd += c;
    }
    return { calls: data?.length ?? 0, costUsd, todayCostUsd };
  });
}

// ---------------------------------------------------------------------------
// Guest data hand-off (signing in to an existing account from a guest session)
// ---------------------------------------------------------------------------

export type GuestSnapshot = { scripts: Script[]; history: PracticeSession[] };

export async function exportGuestData(): Promise<GuestSnapshot> {
  const [scripts, history] = await Promise.all([listScripts(), listPracticeHistory(1000)]);
  return { scripts, history };
}

/** How far a guest-data copy got; saved after every step so a failed copy can resume without duplicates. */
export type MergeProgress = { scriptIds: Record<string, string>; historyChunksDone: number };

/**
 * Copies a guest's scripts and history into the signed-in account, resuming from `progress`.
 * `onProgress` is awaited after every script and history chunk. Returns the number of scripts.
 */
export async function importGuestData(
  snapshot: GuestSnapshot,
  progress: MergeProgress,
  onProgress: (progress: MergeProgress) => Promise<void>,
): Promise<number> {
  const supabase = getSupabase();
  const afterScripts = await copyGuestScripts(supabase, snapshot.scripts, progress, onProgress);
  await copyGuestHistory(supabase, snapshot.history, afterScripts, onProgress);
  return snapshot.scripts.length;
}

/** Copies each script not yet copied, recording old id -> new id. Returns the updated progress. */
async function copyGuestScripts(
  supabase: SupabaseClient,
  scripts: Script[],
  progress: MergeProgress,
  onProgress: (progress: MergeProgress) => Promise<void>,
): Promise<MergeProgress> {
  for (const s of scripts) {
    if (progress.scriptIds[s.id]) continue; // already copied on an earlier try
    const newId = await insertGuestScript(supabase, s);
    progress = { ...progress, scriptIds: { ...progress.scriptIds, [s.id]: newId } };
    await onProgress(progress);
  }
  return progress;
}

async function insertGuestScript(supabase: SupabaseClient, s: Script): Promise<string> {
  const { data, error } = await supabase
    .from('places_scripts')
    .insert({
      title: s.title,
      lines: s.lines,
      characters: s.characters,
      character_genders: s.character_genders,
      my_character: s.my_character,
      source_type: s.source_type,
      last_practiced_at: s.last_practiced_at,
    })
    .select('id')
    .single();
  if (error || !data) dbError(error, 'copy your scripts');
  return data.id as string;
}

const HISTORY_CHUNK_SIZE = 200;

/** Inserts history in chunks, skipping chunks already done on an earlier try. */
async function copyGuestHistory(
  supabase: SupabaseClient,
  history: PracticeSession[],
  progress: MergeProgress,
  onProgress: (progress: MergeProgress) => Promise<void>,
): Promise<void> {
  const rows = toCopiedHistoryRows(history, progress.scriptIds);
  for (let chunk = progress.historyChunksDone; chunk * HISTORY_CHUNK_SIZE < rows.length; chunk++) {
    const { error } = await supabase
      .from('places_practice_history')
      .insert(rows.slice(chunk * HISTORY_CHUNK_SIZE, (chunk + 1) * HISTORY_CHUNK_SIZE));
    if (error) dbError(error, 'copy your practice history');
    progress = { ...progress, historyChunksDone: chunk + 1 };
    await onProgress(progress);
  }
}

/** History rows pointed at the copied scripts; sessions for scripts that weren't copied are dropped. */
function toCopiedHistoryRows(history: PracticeSession[], scriptIds: MergeProgress['scriptIds']) {
  return history
    .filter((h) => !h.script_id || scriptIds[h.script_id])
    .map((h) => ({
      script_id: h.script_id ? scriptIds[h.script_id] : null,
      mode: h.mode,
      character: h.character,
      scene: h.scene,
      started_at: h.started_at,
      ended_at: h.ended_at,
      duration_seconds: h.duration_seconds,
      lines_total: h.lines_total,
      perfect_count: h.perfect_count,
      close_count: h.close_count,
      missed_count: h.missed_count,
      score: h.score,
      details: h.details,
    }));
}

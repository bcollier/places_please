import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

import { AppError, withTimeout } from '@/lib/errors';
import type { ParsedLine } from '@/lib/script-model';
import { getSupabase } from '@/lib/supabase';

/**
 * Client for the `places-ai` Supabase edge function. The OpenRouter key never leaves the server;
 * this only sends the user's own pages / audio with their session token.
 */

type ExtractTextResult = { pages: string[]; totalPages: number };
type ParseResult = {
  title: string | null;
  lines: ParsedLine[];
  characters?: { name: string; gender: 'female' | 'male' | 'unknown' }[];
};
type SpeakResult = { audio: string; format: 'mp3' };
type TranscribeResult = { transcript: string };

async function invoke<T>(body: Record<string, unknown>, timeoutMs: number, signal?: AbortSignal): Promise<T> {
  // `signal` really cancels the request; the edge function then aborts its OpenRouter call too.
  const call = getSupabase().functions.invoke('places-ai', { body, signal });
  const { data, error } = await withTimeout(call, timeoutMs);

  if (error) {
    if (error instanceof FunctionsHttpError) {
      let message = 'The AI service had a problem. Please try again.';
      let code = 'ai_error';
      try {
        const payload = await error.context.json();
        if (payload?.error?.message) message = String(payload.error.message);
        if (payload?.error?.code) code = String(payload.error.code);
      } catch {
        // response wasn't JSON
      }
      const status: number | undefined = error.context?.status;
      if (status === 404) {
        message = "The AI service isn't deployed yet. Deploy the `places-ai` edge function (see README).";
      }
      // Limits and bad input won't fix themselves by retrying.
      const retryable = !(code === 'daily_limit' || code === 'not_allowed' || code === 'tts_not_configured' || code === 'tts_quota' || code === 'voice_unavailable' || code === 'bad_request' || code === 'too_large' || code === 'unreadable_file' || status === 404);
      throw new AppError(message, code, retryable);
    }
    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      throw new AppError("Can't reach the AI service. Check your internet connection.", 'network');
    }
    throw new AppError('The AI service had a problem. Please try again.', 'ai_error');
  }

  const result = (data as { data?: T } | null)?.data;
  if (!result) throw new AppError('The AI service returned an empty response.', 'ai_error');
  return result;
}

export function extractDocumentText(kind: 'pdf' | 'docx', base64: string, signal?: AbortSignal) {
  return invoke<ExtractTextResult>({ action: 'extract_text', file: { kind, base64 } }, 90_000, signal);
}

export type ParseContext = {
  knownCharacters: string[];
  lastSpeaker: string | null;
  lastScene: string | null;
  chunkIndex: number;
  chunkCount: number;
};

export function parseScriptChunk(
  input: { kind: 'images'; images: string[] } | { kind: 'text'; text: string } | { kind: 'pdf'; base64: string },
  context: ParseContext,
  signal?: AbortSignal,
) {
  return invoke<ParseResult>({ action: 'parse_script', input, context }, 280_000, signal);
}

/** Woman's or man's voice for each character of a script (for scripts imported without guesses). */
export function guessGenders(characters: { name: string; sample: string }[]) {
  return invoke<{ characters: { name: string; gender: 'female' | 'male' | 'unknown' }[] }>(
    { action: 'guess_genders', characters },
    35_000,
  );
}

/** ElevenLabs voice for one line; returns base64 MP3. Short timeout: the phone voice takes over if it's slow. */
export function synthesizeSpeech(text: string, voice: string, rate: number) {
  return invoke<SpeakResult>({ action: 'speak', text, voice, rate }, 12_000);
}

export function transcribeAudio(base64: string, format: 'wav' | 'm4a', vocabulary: string[]) {
  return invoke<TranscribeResult>(
    { action: 'transcribe', audio: { base64, format }, vocabulary: vocabulary.slice(0, 40) },
    20_000,
  );
}

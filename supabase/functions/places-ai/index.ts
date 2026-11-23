// Places, Please — AI edge function.
//
// The only place the OpenRouter API key lives. The mobile app never sees it.
// Every OpenRouter request (success or failure) is logged to public.places_ai_calls with tokens and cost.
//
// Actions (POST JSON):
//   { action: "extract_text", file: { kind: "pdf" | "docx", base64 } }        -> { pages: string[] }   (no AI call)
//   { action: "parse_script", input: {...}, context: {...} }                  -> { title, lines[] }
//   { action: "transcribe", audio: { base64, format: "wav" }, vocabulary? }   -> { transcript }
//   { action: "speak", text, voice, rate }                                    -> { audio: base64 mp3 }   (ElevenLabs)
//   { action: "guess_genders", characters: [{ name, sample }] }                -> { characters: [{ name, gender }] }
//   { action: "delete_account" }                                              -> { deleted: true }
//
// Secrets (set with `supabase secrets set`):
//   OPENROUTER_API_KEY              required
//   OPENROUTER_PARSE_MODELS         optional, comma separated, first is preferred
//   OPENROUTER_TRANSCRIBE_MODELS    optional, comma separated
//   DAILY_USER_LIMIT_USD            optional, default 3
//   DAILY_TOTAL_LIMIT_USD           optional, default 10 (both caps are enforced atomically in the database)
//   ALLOWED_EMAILS                  optional, comma separated. When set, only these signed-in emails can use
//                                   the AI actions (like Ignatius at Home); guests and other accounts get 403.
//   ELEVENLABS_API_KEY              needed for scene-partner voices (without it the app uses the phone's voices)
//   ELEVENLABS_MODEL                optional, default eleven_flash_v2_5
//   ELEVENLABS_USD_PER_CREDIT       optional, default 0.0002 (your plan's price per credit, for the cost log)
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { unzipSync, strFromU8 } from 'npm:fflate@0.8.2';
import { extractText, getDocumentProxy } from 'npm:unpdf@2.1.0';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const PARSE_MODELS = listEnv('OPENROUTER_PARSE_MODELS', ['google/gemini-3.8-flash', 'google/gemini-2.5-flash']);
const TRANSCRIBE_MODELS = listEnv('OPENROUTER_TRANSCRIBE_MODELS', [
  'google/gemini-3.5-flash-lite',
  'google/gemini-2.5-flash',
]);
const DAILY_USER_LIMIT_USD = numberEnv('DAILY_USER_LIMIT_USD', 3);
const DAILY_TOTAL_LIMIT_USD = numberEnv('DAILY_TOTAL_LIMIT_USD', 10);
const ALLOWED_EMAILS = (Deno.env.get('ALLOWED_EMAILS') ?? '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const MAX_REQUEST_BYTES = 15 * 1024 * 1024;
const MAX_IMAGES_PER_CALL = 6;
const MAX_TEXT_CHARS = 40_000;
const MAX_PDF_PAGES = 200;
const MAX_AUDIO_BASE64_CHARS = 8 * 1024 * 1024; // ~6MB of WAV, a little over 3 minutes at 16kHz mono
const MAX_TTS_CHARS = 2500;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

function listEnv(name: string, fallback: string[]): string[] {
  const raw = Deno.env.get(name);
  if (!raw) return fallback;
  const list = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length ? list : fallback;
}

function numberEnv(name: string, fallback: number): number {
  const value = Number(Deno.env.get(name));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error('Unhandled error', err);
  return json({ error: { code: 'internal', message: 'Something went wrong on the server.' } }, 500);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse(new HttpError(405, 'method_not_allowed', 'Use POST.'));

  try {
    const contentLength = Number(req.headers.get('content-length') ?? '0');
    if (contentLength > MAX_REQUEST_BYTES) {
      throw new HttpError(413, 'too_large', 'That file is too large. Try fewer pages at a time.');
    }

    const { userId, email } = await authenticate(req);
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      throw new HttpError(400, 'bad_request', 'Request body must be JSON.');
    }
    const requestBytes = contentLength || JSON.stringify(body).length;

    switch (body.action) {
      case 'extract_text':
        return json({ data: await handleExtractText(body) });
      case 'parse_script':
        enforceAllowList(email);
        return json({ data: await handleParseScript(body, { admin, userId, requestBytes, signal: req.signal }) });
      case 'transcribe':
        enforceAllowList(email);
        return json({ data: await handleTranscribe(body, { admin, userId, requestBytes, signal: req.signal }) });
      case 'guess_genders':
        enforceAllowList(email);
        return json({ data: await handleGuessGenders(body, { admin, userId, requestBytes, signal: req.signal }) });
      case 'speak':
        enforceAllowList(email);
        return json({ data: await handleSpeak(body, { admin, userId, requestBytes, signal: req.signal }) });
      case 'delete_account': {
        // The Supabase project is shared with other apps (Ignatius at Home), and an email login is
        // shared with them too. So: always delete this app's data; delete the login itself only for a
        // guest (anonymous) user, which no other app uses. places_ai_calls rows are kept for cost
        // accounting with user_id cleared.
        for (const table of ['places_practice_history', 'places_scripts', 'places_profiles']) {
          const column = table === 'places_profiles' ? 'id' : 'user_id';
          const { error } = await admin.from(table).delete().eq(column, userId);
          if (error) {
            console.error(`Deleting ${table} failed`, error);
            throw new HttpError(500, 'delete_failed', "Couldn't delete your data. Please try again.");
          }
        }
        await admin.from('places_ai_calls').update({ user_id: null }).eq('user_id', userId);
        const { data: who } = await admin.auth.admin.getUserById(userId);
        const isGuest = !!who.user?.is_anonymous && !who.user?.email;
        if (isGuest) {
          const { error } = await admin.auth.admin.deleteUser(userId);
          if (error) console.error('Guest login deletion failed', error);
        }
        return json({ data: { deleted: true, loginDeleted: isGuest } });
      }
      default:
        throw new HttpError(400, 'bad_request', 'Unknown action.');
    }
  } catch (err) {
    return errorResponse(err);
  }
});

async function authenticate(req: Request): Promise<{ userId: string; email: string | null }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new HttpError(401, 'unauthorized', 'Please sign in again.');
  }
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser(authHeader.slice('Bearer '.length));
  if (error || !data.user) throw new HttpError(401, 'unauthorized', 'Please sign in again.');
  return { userId: data.user.id, email: data.user.email?.toLowerCase() ?? null };
}

/** Like Ignatius at Home's ALLOWED_EMAILS: when set, only those accounts can spend on AI. */
function enforceAllowList(email: string | null) {
  if (ALLOWED_EMAILS.length === 0) return;
  if (!email || !ALLOWED_EMAILS.includes(email)) {
    throw new HttpError(
      403,
      'not_allowed',
      'AI features are limited to approved accounts. Sign in with your email in Settings › Account.',
    );
  }
}

// ---------------------------------------------------------------------------
// extract_text: PDF / Word text extraction (no AI, no cost)
// ---------------------------------------------------------------------------

async function handleExtractText(body: Record<string, unknown>) {
  const file = body.file as { kind?: string; base64?: string } | undefined;
  if (!file || typeof file.base64 !== 'string' || !file.base64) {
    throw new HttpError(400, 'bad_request', 'No file was sent.');
  }
  const bytes = decodeBase64(file.base64);

  if (file.kind === 'pdf') {
    try {
      const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
      if (pdf.numPages > MAX_PDF_PAGES) {
        throw new HttpError(413, 'too_large', `That PDF has ${pdf.numPages} pages. Please upload ${MAX_PDF_PAGES} pages or fewer.`);
      }
      const { totalPages, text } = await extractText(pdf, { mergePages: false });
      const pages = (Array.isArray(text) ? text : [text]).map((t) => String(t ?? ''));
      return { pages, totalPages };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error('PDF extraction failed', err);
      throw new HttpError(422, 'unreadable_file', "That PDF couldn't be opened. It may be damaged or password protected.");
    }
  }

  if (file.kind === 'docx') {
    try {
      const files = unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' });
      const xml = files['word/document.xml'];
      if (!xml) throw new Error('missing document.xml');
      const text = docxXmlToText(strFromU8(xml));
      return { pages: [text], totalPages: 1 };
    } catch (err) {
      console.error('DOCX extraction failed', err);
      throw new HttpError(
        422,
        'unreadable_file',
        "That Word file couldn't be opened. Make sure it's a .docx file (not an older .doc).",
      );
    }
  }

  throw new HttpError(400, 'bad_request', 'Only PDF and Word (.docx) files are supported.');
}

function docxXmlToText(xml: string): string {
  const paragraphs = xml.split(/<\/w:p>/);
  const out: string[] = [];
  for (const p of paragraphs) {
    let line = '';
    const tokens = p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g);
    for (const t of tokens) {
      if (t[0].startsWith('<w:tab')) line += '\t';
      else if (t[0].startsWith('<w:br')) line += '\n';
      else line += decodeXmlEntities(t[1] ?? '');
    }
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

function decodeBase64(b64: string): Uint8Array {
  try {
    const clean = b64.includes(',') && b64.startsWith('data:') ? b64.slice(b64.indexOf(',') + 1) : b64;
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    throw new HttpError(400, 'bad_request', 'The file data was corrupted in transit.');
  }
}

// ---------------------------------------------------------------------------
// parse_script: turn pages (images, text, or a scanned PDF) into dialogue lines
// ---------------------------------------------------------------------------

const PARSE_SYSTEM_PROMPT = `You convert pages of a stage play or screenplay into structured dialogue for an actor's line-memorization app.

Rules:
- Output every spoken line of dialogue in reading order, one entry per speech (everything a character says before another character speaks or a scene changes).
- character: the speaker's name normalized to UPPERCASE, without extensions like (V.O.), (O.S.), (CONT'D). If a name matches one in knownCharacters (even abbreviated, e.g. "HAM." for "HAMLET"), use the knownCharacters spelling.
- text: the exact words spoken. Preserve wording, contractions and punctuation exactly. Join words broken across line or page wraps. Remove stage directions and parentheticals such as "(beat)", "(to Ophelia)", "[Exit]". Never paraphrase, summarize, modernize or fix grammar.
- Skip stage directions, scene descriptions, page numbers, running headers/footers, cast lists, and transitions (CUT TO:, BLACKOUT).
- scene: the act/scene or scene heading in effect (e.g. "Act 1, Scene 2" or "INT. KITCHEN - NIGHT"). If the pages don't show a new heading, use lastScene from the context. Use null if there is none.
- continuation: true only for the very first entry, and only when the page begins mid-speech continuing the previous page's speaker (given as lastSpeaker). In that case set character to lastSpeaker. Otherwise false.
- title: the play's title if clearly shown on these pages, otherwise null.
- characters: every speaker on these pages (same UPPERCASE names as in lines) with gender "female", "male" or "unknown", judged from the name, pronouns and stage directions. This only picks a voice, so make your best guess and use "unknown" only when there's no hint.
- If the pages contain no dialogue, return an empty lines array.`;

const PARSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'characters', 'lines'],
  properties: {
    title: { type: ['string', 'null'] },
    characters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'gender'],
        properties: {
          name: { type: 'string' },
          gender: { type: 'string', enum: ['female', 'male', 'unknown'] },
        },
      },
    },
    lines: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['character', 'text', 'scene', 'continuation'],
        properties: {
          character: { type: 'string' },
          text: { type: 'string' },
          scene: { type: ['string', 'null'] },
          continuation: { type: 'boolean' },
        },
      },
    },
  },
};

type CallContext = { admin: SupabaseClient; userId: string; requestBytes: number; signal: AbortSignal };

// ---------------------------------------------------------------------------
// AI call ledger
//
// Every paid call is recorded BEFORE it is sent ("pending", with an estimated cost) by
// places_begin_ai_call, which also checks the daily caps atomically. After the reply the row is
// completed with the cost the provider reported. If the function dies mid-call, the pending row and
// its estimate remain, so nothing sent goes unrecorded. If the pending row can't be written, the call
// is not sent (fail closed).
// ---------------------------------------------------------------------------

const ESTIMATE_USD: Record<string, number> = {
  parse_script_text: 0.05,
  parse_script_images: 0.05,
  parse_script_pdf: 0.1,
  transcribe: 0.002,
  guess_genders: 0.002,
};

async function beginCall(ctx: CallContext, purpose: string, model: string, estimateUsd: number): Promise<string> {
  const { data, error } = await ctx.admin.rpc('places_begin_ai_call', {
    p_user_id: ctx.userId,
    p_purpose: purpose,
    p_model: model,
    p_estimate: estimateUsd,
    p_request_bytes: ctx.requestBytes,
    p_user_limit: DAILY_USER_LIMIT_USD,
    p_total_limit: DAILY_TOTAL_LIMIT_USD,
  });
  if (error || typeof data !== 'string') {
    if (error && /places_daily_limit/.test(error.message)) {
      throw new HttpError(429, 'daily_limit', "Today's AI budget has been used up. It resets at midnight UTC.");
    }
    console.error('Could not record the AI call before sending it; not sending', error);
    throw new HttpError(503, 'unavailable', 'The AI service is temporarily unavailable. Try again shortly.');
  }
  return data;
}

type CallOutcome = {
  status: 'success' | 'error';
  httpStatus: number | null;
  latency: number;
  modelUsed?: string | null;
  generationId?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  totalTokens?: number | null;
  costUsd: number;
  costIsEstimate: boolean;
  error: string | null;
};

async function finishCall(ctx: CallContext, callId: string, outcome: CallOutcome) {
  const update = {
    status: outcome.status,
    http_status: outcome.httpStatus,
    latency_ms: outcome.latency,
    model_used: outcome.modelUsed ?? null,
    generation_id: outcome.generationId ?? null,
    prompt_tokens: outcome.promptTokens ?? null,
    completion_tokens: outcome.completionTokens ?? null,
    total_tokens: outcome.totalTokens ?? null,
    cost_usd: outcome.costUsd,
    cost_is_estimate: outcome.costIsEstimate,
    error: outcome.error,
    completed_at: new Date().toISOString(),
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await ctx.admin.from('places_ai_calls').update(update).eq('id', callId);
    if (!error) return;
    if (attempt < 3) await sleep(200 * attempt);
    else console.error(`Could not complete AI call ${callId}; it stays pending with its estimated cost`, error);
  }
}

async function handleParseScript(body: Record<string, unknown>, ctx: CallContext) {
  const input = body.input as
    | { kind: 'images'; images: unknown }
    | { kind: 'text'; text: unknown }
    | { kind: 'pdf'; base64: unknown }
    | undefined;
  const context = (body.context ?? {}) as {
    knownCharacters?: unknown;
    lastSpeaker?: unknown;
    lastScene?: unknown;
    chunkIndex?: unknown;
    chunkCount?: unknown;
  };

  const knownCharacters = Array.isArray(context.knownCharacters)
    ? context.knownCharacters.filter((c): c is string => typeof c === 'string').slice(0, 100)
    : [];
  const contextText = JSON.stringify({
    knownCharacters,
    lastSpeaker: typeof context.lastSpeaker === 'string' ? context.lastSpeaker : null,
    lastScene: typeof context.lastScene === 'string' ? context.lastScene : null,
    part: `${Number(context.chunkIndex ?? 0) + 1} of ${Number(context.chunkCount ?? 1)}`,
  });

  const content: unknown[] = [{ type: 'text', text: `Context: ${contextText}\n\nExtract the dialogue from these pages.` }];
  let purpose = 'parse_script_text';
  let plugins: unknown[] | undefined;

  if (input?.kind === 'images') {
    const images = Array.isArray(input.images) ? input.images.filter((i): i is string => typeof i === 'string') : [];
    if (images.length === 0) throw new HttpError(400, 'bad_request', 'No pages were sent.');
    if (images.length > MAX_IMAGES_PER_CALL) throw new HttpError(400, 'bad_request', 'Too many pages in one request.');
    for (const img of images) {
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } });
    }
    purpose = 'parse_script_images';
  } else if (input?.kind === 'text') {
    if (typeof input.text !== 'string' || !input.text.trim()) throw new HttpError(400, 'bad_request', 'No text was sent.');
    if (input.text.length > MAX_TEXT_CHARS) throw new HttpError(400, 'bad_request', 'Too much text in one request.');
    content.push({ type: 'text', text: `PAGES:\n"""\n${input.text}\n"""` });
  } else if (input?.kind === 'pdf') {
    if (typeof input.base64 !== 'string' || !input.base64) throw new HttpError(400, 'bad_request', 'No file was sent.');
    content.push({
      type: 'file',
      file: { filename: 'script.pdf', file_data: `data:application/pdf;base64,${input.base64}` },
    });
    plugins = [{ id: 'file-parser', pdf: { engine: 'native' } }];
    purpose = 'parse_script_pdf';
  } else {
    throw new HttpError(400, 'bad_request', 'Unknown script input.');
  }

  const result = await callOpenRouter(ctx, {
    purpose,
    models: PARSE_MODELS,
    timeoutMs: 120_000,
    body: {
      messages: [
        { role: 'system', content: PARSE_SYSTEM_PROMPT },
        { role: 'user', content },
      ],
      temperature: 0,
      max_tokens: 32_000,
      // Copying dialogue doesn't need deep thinking; "low" is much faster and cheaper than the default.
      reasoning: { effort: 'low' },
      response_format: { type: 'json_schema', json_schema: { name: 'script_lines', strict: true, schema: PARSE_SCHEMA } },
      ...(plugins ? { plugins } : {}),
    },
  });

  const parsed = parseJsonContent(result.content) as { title?: unknown; lines?: unknown; characters?: unknown };
  const lines = Array.isArray(parsed.lines) ? parsed.lines : [];
  const characters = Array.isArray(parsed.characters) ? parsed.characters : [];
  return {
    title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 200) : null,
    characters: characters
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c) => ({
        name: String(c.name ?? '').trim().toUpperCase().slice(0, 80),
        gender: c.gender === 'female' || c.gender === 'male' ? c.gender : 'unknown',
      }))
      .filter((c) => c.name),
    lines: lines
      .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
      .map((l) => ({
        character: String(l.character ?? '').trim().toUpperCase().slice(0, 80),
        text: String(l.text ?? '').trim(),
        scene: typeof l.scene === 'string' && l.scene.trim() ? l.scene.trim().slice(0, 120) : null,
        continuation: l.continuation === true,
      }))
      .filter((l) => l.character && l.text),
  };
}

// ---------------------------------------------------------------------------
// speak: ElevenLabs text-to-speech for one line
//
// The ElevenLabs key lives only here (secret ELEVENLABS_API_KEY). ElevenLabs bills in credits and the
// dollar value of a credit depends on the plan, so the logged cost is credits used x
// ELEVENLABS_USD_PER_CREDIT, flagged as an estimate. If this fails the app uses the phone's own voice.
// ---------------------------------------------------------------------------

const ELEVENLABS_MODEL = Deno.env.get('ELEVENLABS_MODEL') || 'eleven_flash_v2_5';
const ELEVENLABS_USD_PER_CREDIT = numberEnv('ELEVENLABS_USD_PER_CREDIT', 0.0002);
// Flash and Turbo models cost half a credit per character; the others one.
const ELEVENLABS_CREDITS_PER_CHAR = /flash|turbo/.test(ELEVENLABS_MODEL) ? 0.5 : 1;

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function handleSpeak(body: Record<string, unknown>, ctx: CallContext) {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const voice = typeof body.voice === 'string' ? body.voice : '';
  // ElevenLabs accepts speeds from 0.7 to 1.2.
  const speed = Math.max(0.7, Math.min(1.2, Number(body.rate) || 1));
  if (!text) throw new HttpError(400, 'bad_request', 'Nothing to say.');
  if (text.length > MAX_TTS_CHARS) throw new HttpError(400, 'bad_request', 'That line is too long to read aloud.');
  if (!/^[A-Za-z0-9]{15,32}$/.test(voice)) throw new HttpError(400, 'bad_request', 'Unknown voice.');

  const key = Deno.env.get('ELEVENLABS_API_KEY');
  if (!key) throw new HttpError(503, 'tts_not_configured', 'ElevenLabs voices aren’t set up yet (add ELEVENLABS_API_KEY).');

  const model = `elevenlabs:${ELEVENLABS_MODEL}:${voice}`;
  const estimate = text.length * ELEVENLABS_CREDITS_PER_CHAR * ELEVENLABS_USD_PER_CREDIT;
  const callId = await beginCall(ctx, 'tts', model, estimate);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const offAbort = onClientAbort(ctx, controller);
  let status: number | null = null;
  const base = { modelUsed: model, promptTokens: text.length };
  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text,
          model_id: ELEVENLABS_MODEL,
          voice_settings: { stability: 0.5, similarity_boost: 0.75, speed },
        }),
      },
    );
    status = res.status;
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      await finishCall(ctx, callId, {
        ...base,
        status: 'error',
        httpStatus: status,
        latency: Date.now() - started,
        costUsd: 0,
        costIsEstimate: false,
        error: detail || `HTTP ${status}`,
      });
      if (status === 401) {
        throw new HttpError(503, 'tts_not_configured', 'ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY.');
      }
      if (status === 404 || /voice_not_found|voice.*not.*found/i.test(detail)) {
        throw new HttpError(400, 'voice_unavailable', 'That ElevenLabs voice isn’t available.');
      }
      if (/quota|credits/i.test(detail)) {
        throw new HttpError(429, 'tts_quota', 'The ElevenLabs account is out of credits.');
      }
      throw new HttpError(502, 'tts_failed', 'ElevenLabs voices aren’t available right now.');
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    const credits = Number(res.headers.get('character-cost') ?? res.headers.get('x-character-count'));
    const used = Number.isFinite(credits) && credits > 0 ? credits : text.length * ELEVENLABS_CREDITS_PER_CHAR;
    await finishCall(ctx, callId, {
      ...base,
      status: 'success',
      httpStatus: status,
      latency: Date.now() - started,
      generationId: res.headers.get('request-id'),
      totalTokens: Math.round(used), // credits used
      costUsd: used * ELEVENLABS_USD_PER_CREDIT,
      costIsEstimate: true,
      error: null,
    });
    return { audio: bytesToBase64(bytes), format: 'mp3', engine: 'elevenlabs' };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Unknown whether ElevenLabs billed it: keep the estimate.
    await finishCall(ctx, callId, {
      ...base,
      status: 'error',
      httpStatus: status,
      latency: Date.now() - started,
      costUsd: estimate,
      costIsEstimate: true,
      error: ctx.signal.aborted ? 'cancelled by app' : String(err).slice(0, 300),
    });
    throw new HttpError(504, 'tts_failed', 'ElevenLabs voices aren’t available right now.');
  } finally {
    clearTimeout(timer);
    offAbort();
  }
}

/** Aborts an outgoing request when the app cancels (closes the connection). Returns an unsubscribe. */
function onClientAbort(ctx: CallContext, controller: AbortController): () => void {
  if (ctx.signal.aborted) {
    controller.abort();
    return () => {};
  }
  const handler = () => controller.abort();
  ctx.signal.addEventListener('abort', handler, { once: true });
  return () => ctx.signal.removeEventListener('abort', handler);
}

// ---------------------------------------------------------------------------
// guess_genders: pick a woman's or man's voice for characters of an existing script
// ---------------------------------------------------------------------------

const GENDER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['characters'],
  properties: {
    characters: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'gender'],
        properties: {
          name: { type: 'string' },
          gender: { type: 'string', enum: ['female', 'male', 'unknown'] },
        },
      },
    },
  },
};

async function handleGuessGenders(body: Record<string, unknown>, ctx: CallContext) {
  const list = Array.isArray(body.characters) ? body.characters : [];
  const characters = list
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof c.name === 'string')
    .slice(0, 60)
    .map((c) => ({ name: String(c.name).slice(0, 80), sample: typeof c.sample === 'string' ? c.sample.slice(0, 300) : '' }));
  if (characters.length === 0) return { characters: [] };

  const result = await callOpenRouter(ctx, {
    purpose: 'guess_genders',
    models: TRANSCRIBE_MODELS,
    timeoutMs: 30_000,
    body: {
      messages: [
        {
          role: 'system',
          content:
            'You cast voices for a play-reading app. For each character, decide whether to use a female or male voice, ' +
            'judging from the name (including well-known plays, e.g. WILLY in Death of a Salesman is male) and their lines. ' +
            'Use "unknown" only when there is no hint at all. Return every character with the exact name given.',
        },
        { role: 'user', content: JSON.stringify(characters) },
      ],
      temperature: 0,
      max_tokens: 2_000,
      response_format: { type: 'json_schema', json_schema: { name: 'genders', strict: true, schema: GENDER_SCHEMA } },
    },
  });
  const parsed = parseJsonContent(result.content) as { characters?: unknown };
  const out = Array.isArray(parsed.characters) ? parsed.characters : [];
  return {
    characters: out
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map((c) => ({
        name: String(c.name ?? '').trim().toUpperCase(),
        gender: c.gender === 'female' || c.gender === 'male' ? c.gender : 'unknown',
      }))
      .filter((c) => c.name),
  };
}

// ---------------------------------------------------------------------------
// transcribe: verbatim speech-to-text for one spoken line
// ---------------------------------------------------------------------------

const TRANSCRIBE_SYSTEM_PROMPT = `You are a verbatim speech transcriber for an actor practicing lines.
Transcribe exactly the English words spoken in the audio.
- Do not correct grammar, finish sentences, or substitute words you think were intended.
- Do not add words that were not spoken. If a word is unclear, write your best guess of what was actually said.
- Omit hesitation sounds (um, uh, er) and non-speech noises.
- If there is no intelligible speech, return an empty transcript.`;

const TRANSCRIBE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['transcript'],
  properties: { transcript: { type: 'string' } },
};

async function handleTranscribe(body: Record<string, unknown>, ctx: CallContext) {
  const audio = body.audio as { base64?: unknown; format?: unknown } | undefined;
  if (!audio || typeof audio.base64 !== 'string' || !audio.base64) {
    throw new HttpError(400, 'bad_request', 'No audio was sent.');
  }
  if (audio.base64.length > MAX_AUDIO_BASE64_CHARS) {
    throw new HttpError(413, 'too_large', 'That recording was too long.');
  }
  const format = audio.format === 'm4a' ? 'm4a' : 'wav';
  const vocabulary = Array.isArray(body.vocabulary)
    ? body.vocabulary.filter((v): v is string => typeof v === 'string').slice(0, 40)
    : [];

  const instructions = vocabulary.length
    ? `Transcribe this audio. Names that may be spoken: ${vocabulary.join(', ')}.`
    : 'Transcribe this audio.';

  const result = await callOpenRouter(ctx, {
    purpose: 'transcribe',
    models: TRANSCRIBE_MODELS,
    timeoutMs: 30_000,
    body: {
      messages: [
        { role: 'system', content: TRANSCRIBE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: instructions },
            { type: 'input_audio', input_audio: { data: audio.base64, format } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 2_000,
      response_format: { type: 'json_schema', json_schema: { name: 'transcript', strict: true, schema: TRANSCRIBE_SCHEMA } },
    },
  });

  const parsed = parseJsonContent(result.content) as { transcript?: unknown };
  return { transcript: typeof parsed.transcript === 'string' ? parsed.transcript.trim() : '' };
}

// ---------------------------------------------------------------------------
// OpenRouter client with retries and cost logging
// ---------------------------------------------------------------------------

type OpenRouterRequest = {
  purpose: string;
  models: string[];
  timeoutMs: number;
  body: Record<string, unknown>;
};

async function callOpenRouter(ctx: CallContext, req: OpenRouterRequest): Promise<{ content: string }> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is not set');
    throw new HttpError(503, 'not_configured', 'The AI service is not set up yet.');
  }

  const maxAttempts = 2;
  const estimate = ESTIMATE_USD[req.purpose] ?? 0.05;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  let lastError: HttpError | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (ctx.signal.aborted) throw new HttpError(499, 'cancelled', 'Cancelled.');
    // Recorded before sending (and the daily caps checked atomically).
    const callId = await beginCall(ctx, req.purpose, req.models[0] ?? 'unknown', estimate);
    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);
    const offAbort = onClientAbort(ctx, controller);
    let httpStatus: number | null = null;

    try {
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'X-Title': 'Places, Please',
        },
        body: JSON.stringify({ models: req.models, usage: { include: true }, ...req.body }),
      });
      httpStatus = res.status;
      const payload = await res.json().catch(() => null);
      const latency = Date.now() - started;
      const usage = (payload?.usage ?? {}) as Record<string, unknown>;
      const reportedCost = num(usage.cost);
      const tokens = {
        modelUsed: payload?.model ?? null,
        generationId: payload?.id ?? null,
        promptTokens: num(usage.prompt_tokens),
        completionTokens: num(usage.completion_tokens),
        totalTokens: num(usage.total_tokens),
      };

      const choiceError = payload?.choices?.[0]?.error;
      if (!res.ok || payload?.error || choiceError) {
        const message = String(payload?.error?.message ?? choiceError?.message ?? `HTTP ${res.status}`);
        // Failed requests report their cost when OpenRouter billed anything; otherwise nothing was charged.
        await finishCall(ctx, callId, {
          ...tokens,
          status: 'error',
          httpStatus,
          latency,
          costUsd: reportedCost ?? 0,
          costIsEstimate: false,
          error: message.slice(0, 500),
        });
        const retryable = res.status === 429 || res.status >= 500 || !!choiceError;
        lastError = new HttpError(
          res.status === 402 ? 503 : 502,
          'ai_failed',
          res.status === 402
            ? 'The AI account is out of credits.'
            : "The AI couldn't process that right now. Please try again.",
        );
        if (retryable && attempt < maxAttempts && !ctx.signal.aborted) {
          await sleep(800 * attempt);
          continue;
        }
        throw lastError;
      }

      const content = payload?.choices?.[0]?.message?.content;
      await finishCall(ctx, callId, {
        ...tokens,
        status: 'success',
        httpStatus,
        latency,
        // OpenRouter's reported cost; the estimate only if it was missing.
        costUsd: reportedCost ?? estimate,
        costIsEstimate: reportedCost === null,
        error: null,
      });
      if (typeof content !== 'string' || !content.trim()) {
        throw new HttpError(502, 'ai_failed', 'The AI returned an empty answer. Please try again.');
      }
      return { content };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      const cancelled = ctx.signal.aborted;
      // Timed out or cancelled mid-flight: the provider may still bill it, so keep the estimate.
      await finishCall(ctx, callId, {
        status: 'error',
        httpStatus,
        latency: Date.now() - started,
        costUsd: estimate,
        costIsEstimate: true,
        error: cancelled ? 'cancelled by app' : aborted ? 'timeout' : String(err).slice(0, 500),
      });
      if (cancelled) throw new HttpError(499, 'cancelled', 'Cancelled.');
      lastError = new HttpError(
        504,
        'ai_timeout',
        aborted ? 'The AI took too long to answer. Please try again.' : 'Could not reach the AI service.',
      );
      if (attempt < maxAttempts) {
        await sleep(800 * attempt);
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
      offAbort();
    }
  }
  throw lastError ?? new HttpError(502, 'ai_failed', 'The AI request failed.');
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  const unfenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
    : trimmed;
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(unfenced.slice(start, end + 1));
      } catch {
        // fall through
      }
    }
    throw new HttpError(502, 'ai_failed', 'The AI returned an answer we could not read. Please try again.');
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

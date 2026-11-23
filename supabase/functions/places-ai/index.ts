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
//
// This file must stay a single file: it is deployed by pasting it into the Supabase dashboard editor.
//
// Sections, in order:
//   1. Configuration          6. parse_script           11. AI call ledger
//   2. HTTP helpers           7. guess_genders          12. Outgoing request timeouts
//   3. Entry point            8. transcribe             13. OpenRouter client
//   4. Sign-in and allow-list 9. speak (ElevenLabs)     14. Small shared helpers
//   5. extract_text          10. delete_account

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { unzipSync, strFromU8 } from 'npm:fflate@0.8.2';
import { extractText, getDocumentProxy } from 'npm:unpdf@2.1.0';

// ---------------------------------------------------------------------------
// 1. Configuration
// ---------------------------------------------------------------------------

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MAX_ATTEMPTS = 2;

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

const ELEVENLABS_MODEL = Deno.env.get('ELEVENLABS_MODEL') || 'eleven_flash_v2_5';
const ELEVENLABS_USD_PER_CREDIT = numberEnv('ELEVENLABS_USD_PER_CREDIT', 0.0002);
// Flash and Turbo models cost half a credit per character; the others one.
const ELEVENLABS_CREDITS_PER_CHAR = /flash|turbo/.test(ELEVENLABS_MODEL) ? 0.5 : 1;

const MAX_REQUEST_BYTES = 15 * 1024 * 1024;
const MAX_IMAGES_PER_CALL = 6;
const MAX_TEXT_CHARS = 40_000;
const MAX_PDF_PAGES = 200;
const MAX_AUDIO_BASE64_CHARS = 8 * 1024 * 1024; // ~6MB of WAV, a little over 3 minutes at 16kHz mono
const MAX_TTS_CHARS = 2500;

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

// ---------------------------------------------------------------------------
// 2. HTTP helpers
// ---------------------------------------------------------------------------

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

function badRequest(message: string): HttpError {
  return new HttpError(400, 'bad_request', message);
}

function cancelledError(): HttpError {
  return new HttpError(499, 'cancelled', 'Cancelled.');
}

// ---------------------------------------------------------------------------
// 3. Entry point
// ---------------------------------------------------------------------------

type RequestBody = Record<string, unknown>;

/** Everything a paid action needs: who is asking, where to log the cost, and the app's cancel signal. */
type CallContext = { admin: SupabaseClient; userId: string; requestBytes: number; signal: AbortSignal };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse(new HttpError(405, 'method_not_allowed', 'Use POST.'));

  try {
    return json({ data: await handleRequest(req) });
  } catch (err) {
    return errorResponse(err);
  }
});

async function handleRequest(req: Request): Promise<unknown> {
  const contentLength = Number(req.headers.get('content-length') ?? '0');
  if (contentLength > MAX_REQUEST_BYTES) {
    throw new HttpError(413, 'too_large', 'That file is too large. Try fewer pages at a time.');
  }

  const { userId, email } = await authenticate(req);
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });
  const body = await readJsonBody(req);
  const requestBytes = contentLength || JSON.stringify(body).length;
  const ctx: CallContext = { admin, userId, requestBytes, signal: req.signal };

  return runAction(body, email, ctx);
}

async function readJsonBody(req: Request): Promise<RequestBody> {
  try {
    return await req.json();
  } catch {
    throw badRequest('Request body must be JSON.');
  }
}

/** Every action that can spend money checks the allow-list first. */
function runAction(body: RequestBody, email: string | null, ctx: CallContext): Promise<unknown> {
  switch (body.action) {
    case 'extract_text':
      return handleExtractText(body);
    case 'parse_script':
      enforceAllowList(email);
      return handleParseScript(body, ctx);
    case 'transcribe':
      enforceAllowList(email);
      return handleTranscribe(body, ctx);
    case 'guess_genders':
      enforceAllowList(email);
      return handleGuessGenders(body, ctx);
    case 'speak':
      enforceAllowList(email);
      return handleSpeak(body, ctx);
    case 'delete_account':
      return handleDeleteAccount(ctx);
    default:
      throw badRequest('Unknown action.');
  }
}

// ---------------------------------------------------------------------------
// 4. Sign-in and allow-list
// ---------------------------------------------------------------------------

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
// 5. extract_text: PDF / Word text extraction (no AI, no cost)
// ---------------------------------------------------------------------------

type ExtractedText = { pages: string[]; totalPages: number };

async function handleExtractText(body: RequestBody): Promise<ExtractedText> {
  const file = body.file as { kind?: string; base64?: string } | undefined;
  if (!file || typeof file.base64 !== 'string' || !file.base64) {
    throw badRequest('No file was sent.');
  }
  const bytes = decodeBase64(file.base64);

  if (file.kind === 'pdf') return extractPdfText(bytes);
  if (file.kind === 'docx') return extractDocxText(bytes);
  throw badRequest('Only PDF and Word (.docx) files are supported.');
}

async function extractPdfText(bytes: Uint8Array): Promise<ExtractedText> {
  try {
    const pdf = await getDocumentProxy(bytes, { maxImageSize: 16_777_216 });
    if (pdf.numPages > MAX_PDF_PAGES) {
      throw new HttpError(
        413,
        'too_large',
        `That PDF has ${pdf.numPages} pages. Please upload ${MAX_PDF_PAGES} pages or fewer.`,
      );
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

function extractDocxText(bytes: Uint8Array): ExtractedText {
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

function docxXmlToText(xml: string): string {
  const paragraphs = xml.split(/<\/w:p>/).map(docxParagraphToText);
  return paragraphs.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function docxParagraphToText(paragraphXml: string): string {
  let line = '';
  const tokens = paragraphXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g);
  for (const t of tokens) {
    if (t[0].startsWith('<w:tab')) line += '\t';
    else if (t[0].startsWith('<w:br')) line += '\n';
    else line += decodeXmlEntities(t[1] ?? '');
  }
  return line;
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

// ---------------------------------------------------------------------------
// 6. parse_script: turn pages (images, text, or a scanned PDF) into dialogue lines
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

const CHARACTER_GENDERS_SCHEMA = {
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
};

const PARSE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'characters', 'lines'],
  properties: {
    title: { type: ['string', 'null'] },
    characters: CHARACTER_GENDERS_SCHEMA,
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

type ScriptInput =
  | { kind: 'images'; images: unknown }
  | { kind: 'text'; text: unknown }
  | { kind: 'pdf'; base64: unknown }
  | undefined;

/** The pages as OpenRouter message parts, plus which ledger purpose (and PDF plugin) they need. */
type PreparedPages = { purpose: string; parts: unknown[]; plugins?: unknown[] };

async function handleParseScript(body: RequestBody, ctx: CallContext) {
  const contextText = describeParseContext(body.context);
  const pages = preparePages(body.input as ScriptInput);
  const content = [{ type: 'text', text: `Context: ${contextText}\n\nExtract the dialogue from these pages.` }, ...pages.parts];

  const result = await callOpenRouter(ctx, {
    purpose: pages.purpose,
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
      ...(pages.plugins ? { plugins: pages.plugins } : {}),
    },
  });

  return normalizeParsedScript(parseJsonContent(result.content));
}

/** The app's running context (known names, last speaker and scene) as JSON for the prompt. */
function describeParseContext(raw: unknown): string {
  const context = (raw ?? {}) as {
    knownCharacters?: unknown;
    lastSpeaker?: unknown;
    lastScene?: unknown;
    chunkIndex?: unknown;
    chunkCount?: unknown;
  };
  const knownCharacters = Array.isArray(context.knownCharacters)
    ? context.knownCharacters.filter((c): c is string => typeof c === 'string').slice(0, 100)
    : [];
  return JSON.stringify({
    knownCharacters,
    lastSpeaker: typeof context.lastSpeaker === 'string' ? context.lastSpeaker : null,
    lastScene: typeof context.lastScene === 'string' ? context.lastScene : null,
    part: `${Number(context.chunkIndex ?? 0) + 1} of ${Number(context.chunkCount ?? 1)}`,
  });
}

function preparePages(input: ScriptInput): PreparedPages {
  if (input?.kind === 'images') return prepareImagePages(input.images);
  if (input?.kind === 'text') return prepareTextPages(input.text);
  if (input?.kind === 'pdf') return preparePdfPages(input.base64);
  throw badRequest('Unknown script input.');
}

function prepareImagePages(value: unknown): PreparedPages {
  const images = Array.isArray(value) ? value.filter((i): i is string => typeof i === 'string') : [];
  if (images.length === 0) throw badRequest('No pages were sent.');
  if (images.length > MAX_IMAGES_PER_CALL) throw badRequest('Too many pages in one request.');
  return {
    purpose: 'parse_script_images',
    parts: images.map((img) => ({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${img}` } })),
  };
}

function prepareTextPages(text: unknown): PreparedPages {
  if (typeof text !== 'string' || !text.trim()) throw badRequest('No text was sent.');
  if (text.length > MAX_TEXT_CHARS) throw badRequest('Too much text in one request.');
  return { purpose: 'parse_script_text', parts: [{ type: 'text', text: `PAGES:\n"""\n${text}\n"""` }] };
}

function preparePdfPages(base64: unknown): PreparedPages {
  if (typeof base64 !== 'string' || !base64) throw badRequest('No file was sent.');
  return {
    purpose: 'parse_script_pdf',
    parts: [{ type: 'file', file: { filename: 'script.pdf', file_data: `data:application/pdf;base64,${base64}` } }],
    plugins: [{ id: 'file-parser', pdf: { engine: 'native' } }],
  };
}

function normalizeParsedScript(value: unknown) {
  const parsed = value as { title?: unknown; lines?: unknown; characters?: unknown };
  return {
    title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim().slice(0, 200) : null,
    characters: normalizeCharacterGenders(parsed.characters, 80),
    lines: normalizeScriptLines(parsed.lines),
  };
}

function normalizeScriptLines(value: unknown) {
  const lines = Array.isArray(value) ? value : [];
  return lines
    .filter(isObject)
    .map((l) => ({
      character: String(l.character ?? '').trim().toUpperCase().slice(0, 80),
      text: String(l.text ?? '').trim(),
      scene: typeof l.scene === 'string' && l.scene.trim() ? l.scene.trim().slice(0, 120) : null,
      continuation: l.continuation === true,
    }))
    .filter((l) => l.character && l.text);
}

/** The model's { name, gender } list, cleaned: UPPERCASE names, and anything but female/male becomes unknown. */
function normalizeCharacterGenders(value: unknown, maxNameLength = Infinity) {
  const characters = Array.isArray(value) ? value : [];
  return characters
    .filter(isObject)
    .map((c) => ({
      name: String(c.name ?? '').trim().toUpperCase().slice(0, maxNameLength),
      gender: c.gender === 'female' || c.gender === 'male' ? c.gender : 'unknown',
    }))
    .filter((c) => c.name);
}

// ---------------------------------------------------------------------------
// 7. guess_genders: pick a woman's or man's voice for characters of an existing script
// ---------------------------------------------------------------------------

const GENDER_SYSTEM_PROMPT =
  'You cast voices for a play-reading app. For each character, decide whether to use a female or male voice, ' +
  'judging from the name (including well-known plays, e.g. WILLY in Death of a Salesman is male) and their lines. ' +
  'Use "unknown" only when there is no hint at all. Return every character with the exact name given.';

const GENDER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['characters'],
  properties: { characters: CHARACTER_GENDERS_SCHEMA },
};

async function handleGuessGenders(body: RequestBody, ctx: CallContext) {
  const characters = readGenderCandidates(body.characters);
  if (characters.length === 0) return { characters: [] };

  const result = await callOpenRouter(ctx, {
    purpose: 'guess_genders',
    models: TRANSCRIBE_MODELS,
    timeoutMs: 30_000,
    body: {
      messages: [
        { role: 'system', content: GENDER_SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(characters) },
      ],
      temperature: 0,
      max_tokens: 2_000,
      response_format: { type: 'json_schema', json_schema: { name: 'genders', strict: true, schema: GENDER_SCHEMA } },
    },
  });

  const parsed = parseJsonContent(result.content) as { characters?: unknown };
  return { characters: normalizeCharacterGenders(parsed.characters) };
}

/** Up to 60 characters, each with a short sample of their lines for the model to judge from. */
function readGenderCandidates(value: unknown): { name: string; sample: string }[] {
  const list = Array.isArray(value) ? value : [];
  return list
    .filter((c): c is Record<string, unknown> => isObject(c) && typeof c.name === 'string')
    .slice(0, 60)
    .map((c) => ({ name: String(c.name).slice(0, 80), sample: typeof c.sample === 'string' ? c.sample.slice(0, 300) : '' }));
}

// ---------------------------------------------------------------------------
// 8. transcribe: verbatim speech-to-text for one spoken line
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

async function handleTranscribe(body: RequestBody, ctx: CallContext) {
  const audio = readAudio(body.audio);
  const instructions = transcribeInstructions(body.vocabulary);

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
            { type: 'input_audio', input_audio: { data: audio.base64, format: audio.format } },
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

function readAudio(value: unknown): { base64: string; format: 'wav' | 'm4a' } {
  const audio = value as { base64?: unknown; format?: unknown } | undefined;
  if (!audio || typeof audio.base64 !== 'string' || !audio.base64) {
    throw badRequest('No audio was sent.');
  }
  if (audio.base64.length > MAX_AUDIO_BASE64_CHARS) {
    throw new HttpError(413, 'too_large', 'That recording was too long.');
  }
  return { base64: audio.base64, format: audio.format === 'm4a' ? 'm4a' : 'wav' };
}

/** Character names in the script help the model spell unusual names it hears. */
function transcribeInstructions(value: unknown): string {
  const vocabulary = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 40) : [];
  return vocabulary.length
    ? `Transcribe this audio. Names that may be spoken: ${vocabulary.join(', ')}.`
    : 'Transcribe this audio.';
}

// ---------------------------------------------------------------------------
// 9. speak: ElevenLabs text-to-speech for one line
//
// The ElevenLabs key lives only here (secret ELEVENLABS_API_KEY). ElevenLabs bills in credits and the
// dollar value of a credit depends on the plan, so the logged cost is credits used x
// ELEVENLABS_USD_PER_CREDIT, flagged as an estimate. If this fails the app uses the phone's own voice.
// ---------------------------------------------------------------------------

const ELEVENLABS_TIMEOUT_MS = 20_000;

type SpeechRequest = { text: string; voice: string; speed: number };

async function handleSpeak(body: RequestBody, ctx: CallContext) {
  const speech = readSpeechRequest(body);
  const apiKey = Deno.env.get('ELEVENLABS_API_KEY');
  if (!apiKey) throw new HttpError(503, 'tts_not_configured', 'ElevenLabs voices aren’t set up yet (add ELEVENLABS_API_KEY).');

  const model = `elevenlabs:${ELEVENLABS_MODEL}:${speech.voice}`;
  const estimate = speech.text.length * ELEVENLABS_CREDITS_PER_CHAR * ELEVENLABS_USD_PER_CREDIT;
  const finish = await beginCall(ctx, 'tts', model, estimate);
  const request = abortableRequest(ctx, ELEVENLABS_TIMEOUT_MS);
  const base = { modelUsed: model, promptTokens: speech.text.length };
  let httpStatus: number | null = null;
  try {
    const res = await postToElevenLabs(apiKey, speech, request.signal);
    httpStatus = res.status;
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      // A rejected request isn't billed.
      await finish({ ...base, status: 'error', httpStatus, costUsd: 0, costIsEstimate: false, error: detail || `HTTP ${httpStatus}` });
      throw elevenLabsError(httpStatus, detail);
    }
    return await readSpeechAudio(res, speech, base, finish);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    // Unknown whether ElevenLabs billed it: keep the estimate.
    const error = ctx.signal.aborted ? 'cancelled by app' : String(err).slice(0, 300);
    await finish({ ...base, status: 'error', httpStatus, costUsd: estimate, costIsEstimate: true, error });
    throw new HttpError(504, 'tts_failed', 'ElevenLabs voices aren’t available right now.');
  } finally {
    request.release();
  }
}

function readSpeechRequest(body: RequestBody): SpeechRequest {
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  const voice = typeof body.voice === 'string' ? body.voice : '';
  // ElevenLabs accepts speeds from 0.7 to 1.2.
  const speed = Math.max(0.7, Math.min(1.2, Number(body.rate) || 1));
  if (!text) throw badRequest('Nothing to say.');
  if (text.length > MAX_TTS_CHARS) throw badRequest('That line is too long to read aloud.');
  if (!/^[A-Za-z0-9]{15,32}$/.test(voice)) throw badRequest('Unknown voice.');
  return { text, voice, speed };
}

function postToElevenLabs(apiKey: string, speech: SpeechRequest, signal: AbortSignal): Promise<Response> {
  return fetch(`https://api.elevenlabs.io/v1/text-to-speech/${speech.voice}?output_format=mp3_44100_64`, {
    method: 'POST',
    signal,
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text: speech.text,
      model_id: ELEVENLABS_MODEL,
      voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: speech.speed },
    }),
  });
}

/** Turns an ElevenLabs error reply into the error code the app acts on (e.g. try another voice). */
function elevenLabsError(status: number, detail: string): HttpError {
  if (status === 401) {
    return new HttpError(503, 'tts_not_configured', 'ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY.');
  }
  if (status === 404 || /voice_not_found|voice.*not.*found/i.test(detail)) {
    return new HttpError(400, 'voice_unavailable', 'That ElevenLabs voice isn’t available.');
  }
  if (/quota|credits/i.test(detail)) {
    return new HttpError(429, 'tts_quota', 'The ElevenLabs account is out of credits.');
  }
  return new HttpError(502, 'tts_failed', 'ElevenLabs voices aren’t available right now.');
}

/** Downloads the MP3, logs the credits used, and returns it as base64. */
async function readSpeechAudio(
  res: Response,
  speech: SpeechRequest,
  base: { modelUsed: string; promptTokens: number },
  finish: FinishCall,
) {
  const bytes = new Uint8Array(await res.arrayBuffer());
  const credits = elevenLabsCreditsUsed(res, speech.text);
  await finish({
    ...base,
    status: 'success',
    httpStatus: res.status,
    generationId: res.headers.get('request-id'),
    totalTokens: Math.round(credits), // credits used
    costUsd: credits * ELEVENLABS_USD_PER_CREDIT,
    costIsEstimate: true,
    error: null,
  });
  return { audio: bytesToBase64(bytes), format: 'mp3', engine: 'elevenlabs' };
}

/** The credits ElevenLabs reports in its headers, or the per-character price when it doesn't. */
function elevenLabsCreditsUsed(res: Response, text: string): number {
  const credits = Number(res.headers.get('character-cost') ?? res.headers.get('x-character-count'));
  return Number.isFinite(credits) && credits > 0 ? credits : text.length * ELEVENLABS_CREDITS_PER_CHAR;
}

// ---------------------------------------------------------------------------
// 10. delete_account
//
// The Supabase project is shared with other apps (Ignatius at Home), and an email login is shared
// with them too. So: always delete this app's data; delete the login itself only for a guest
// (anonymous) user, which no other app uses. places_ai_calls rows are kept for cost accounting with
// user_id cleared.
// ---------------------------------------------------------------------------

async function handleDeleteAccount(ctx: CallContext) {
  const { admin, userId } = ctx;
  await deleteAppData(admin, userId);
  await admin.from('places_ai_calls').update({ user_id: null }).eq('user_id', userId);
  const loginDeleted = await deleteLoginIfGuest(admin, userId);
  return { deleted: true, loginDeleted };
}

async function deleteAppData(admin: SupabaseClient, userId: string) {
  for (const table of ['places_practice_history', 'places_scripts', 'places_profiles']) {
    const column = table === 'places_profiles' ? 'id' : 'user_id';
    const { error } = await admin.from(table).delete().eq(column, userId);
    if (error) {
      console.error(`Deleting ${table} failed`, error);
      throw new HttpError(500, 'delete_failed', "Couldn't delete your data. Please try again.");
    }
  }
}

/** Returns whether the user was a guest (and so had their login deleted). */
async function deleteLoginIfGuest(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data: who } = await admin.auth.admin.getUserById(userId);
  const isGuest = !!who.user?.is_anonymous && !who.user?.email;
  if (isGuest) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error('Guest login deletion failed', error);
  }
  return isGuest;
}

// ---------------------------------------------------------------------------
// 11. AI call ledger
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

/** Completes a pending ledger row. Latency is measured from when the row was written. */
type FinishCall = (outcome: Omit<CallOutcome, 'latency'>) => Promise<void>;

/**
 * Writes the pending row (and checks the daily caps) before anything is sent. Throws, so the call is
 * never sent, if that fails. Returns the `finish` function that must be called after every outcome.
 */
async function beginCall(ctx: CallContext, purpose: string, model: string, estimateUsd: number): Promise<FinishCall> {
  const callId = await insertPendingCall(ctx, purpose, model, estimateUsd);
  const started = Date.now();
  return (outcome) => finishCall(ctx, callId, { ...outcome, latency: Date.now() - started });
}

async function insertPendingCall(ctx: CallContext, purpose: string, model: string, estimateUsd: number): Promise<string> {
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

/** Retries a few times; if it still fails the row stays pending with its estimate (never under-counted). */
async function finishCall(ctx: CallContext, callId: string, outcome: CallOutcome) {
  const update = toLedgerRow(outcome);
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await ctx.admin.from('places_ai_calls').update(update).eq('id', callId);
    if (!error) return;
    if (attempt < 3) await sleep(200 * attempt);
    else console.error(`Could not complete AI call ${callId}; it stays pending with its estimated cost`, error);
  }
}

function toLedgerRow(outcome: CallOutcome) {
  return {
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
}

// ---------------------------------------------------------------------------
// 12. Outgoing request timeouts and cancellation
// ---------------------------------------------------------------------------

/**
 * A signal for an outgoing request that aborts after `timeoutMs` or when the app cancels.
 * Call `release` once the request is done.
 */
function abortableRequest(ctx: CallContext, timeoutMs: number): { signal: AbortSignal; release: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const offAbort = onClientAbort(ctx, controller);
  return {
    signal: controller.signal,
    release: () => {
      clearTimeout(timer);
      offAbort();
    },
  };
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
// 13. OpenRouter client with retries and cost logging
//
// Each attempt gets its own ledger row: begun before sending, finished after every outcome.
// ---------------------------------------------------------------------------

type OpenRouterRequest = {
  purpose: string;
  models: string[];
  timeoutMs: number;
  body: Record<string, unknown>;
};

/** OpenRouter's JSON reply. Loosely typed: any field may be missing or malformed. */
type OpenRouterPayload = {
  id?: string;
  model?: string;
  usage?: Record<string, unknown>;
  error?: { message?: unknown };
  choices?: { error?: { message?: unknown }; message?: { content?: unknown } }[];
} | null;

type AttemptResult = { ok: true; content: string } | { ok: false; error: HttpError; retryable: boolean };

async function callOpenRouter(ctx: CallContext, req: OpenRouterRequest): Promise<{ content: string }> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY');
  if (!apiKey) {
    console.error('OPENROUTER_API_KEY is not set');
    throw new HttpError(503, 'not_configured', 'The AI service is not set up yet.');
  }
  const estimate = ESTIMATE_USD[req.purpose] ?? 0.05;
  let lastError: HttpError | null = null;

  for (let attempt = 1; attempt <= OPENROUTER_MAX_ATTEMPTS; attempt++) {
    if (ctx.signal.aborted) throw cancelledError();
    const result = await attemptOpenRouter(ctx, req, apiKey, estimate);
    if (result.ok) return { content: result.content };
    lastError = result.error;
    if (!result.retryable || attempt >= OPENROUTER_MAX_ATTEMPTS) throw result.error;
    await sleep(800 * attempt);
  }
  throw lastError ?? new HttpError(502, 'ai_failed', 'The AI request failed.');
}

/** One request with its own ledger row. Throws only for errors that must not be retried. */
async function attemptOpenRouter(
  ctx: CallContext,
  req: OpenRouterRequest,
  apiKey: string,
  estimate: number,
): Promise<AttemptResult> {
  // Recorded before sending (and the daily caps checked atomically).
  const finish = await beginCall(ctx, req.purpose, req.models[0] ?? 'unknown', estimate);
  const request = abortableRequest(ctx, req.timeoutMs);
  let httpStatus: number | null = null;
  try {
    const res = await postToOpenRouter(apiKey, req, request.signal);
    httpStatus = res.status;
    const payload: OpenRouterPayload = await res.json().catch(() => null);
    return await settleOpenRouterReply(ctx, finish, res, payload, estimate);
  } catch (err) {
    if (err instanceof HttpError) throw err;
    return await settleOpenRouterTransportError(ctx, finish, err, httpStatus, estimate);
  } finally {
    request.release();
  }
}

function postToOpenRouter(apiKey: string, req: OpenRouterRequest, signal: AbortSignal): Promise<Response> {
  return fetch(OPENROUTER_URL, {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Places, Please',
    },
    body: JSON.stringify({ models: req.models, usage: { include: true }, ...req.body }),
  });
}

/** Logs a reply that arrived (success or error) and decides whether it is worth retrying. */
async function settleOpenRouterReply(
  ctx: CallContext,
  finish: FinishCall,
  res: Response,
  payload: OpenRouterPayload,
  estimate: number,
): Promise<AttemptResult> {
  const { reportedCost, tokens } = readOpenRouterUsage(payload);
  const choiceError = payload?.choices?.[0]?.error;

  if (!res.ok || payload?.error || choiceError) {
    const message = String(payload?.error?.message ?? choiceError?.message ?? `HTTP ${res.status}`);
    // Failed requests report their cost when OpenRouter billed anything; otherwise nothing was charged.
    await finish({
      ...tokens,
      status: 'error',
      httpStatus: res.status,
      costUsd: reportedCost ?? 0,
      costIsEstimate: false,
      error: message.slice(0, 500),
    });
    const retryable = (res.status === 429 || res.status >= 500 || !!choiceError) && !ctx.signal.aborted;
    return { ok: false, error: openRouterHttpError(res.status), retryable };
  }

  const content = payload?.choices?.[0]?.message?.content;
  await finish({
    ...tokens,
    status: 'success',
    httpStatus: res.status,
    // OpenRouter's reported cost; the estimate only if it was missing.
    costUsd: reportedCost ?? estimate,
    costIsEstimate: reportedCost === null,
    error: null,
  });
  if (typeof content !== 'string' || !content.trim()) {
    throw new HttpError(502, 'ai_failed', 'The AI returned an empty answer. Please try again.');
  }
  return { ok: true, content };
}

/** The cost and token counts OpenRouter reported (null where missing). */
function readOpenRouterUsage(payload: OpenRouterPayload) {
  const usage = (payload?.usage ?? {}) as Record<string, unknown>;
  return {
    reportedCost: finiteOrNull(usage.cost),
    tokens: {
      modelUsed: payload?.model ?? null,
      generationId: payload?.id ?? null,
      promptTokens: finiteOrNull(usage.prompt_tokens),
      completionTokens: finiteOrNull(usage.completion_tokens),
      totalTokens: finiteOrNull(usage.total_tokens),
    },
  };
}

function openRouterHttpError(status: number): HttpError {
  if (status === 402) return new HttpError(503, 'ai_failed', 'The AI account is out of credits.');
  return new HttpError(502, 'ai_failed', "The AI couldn't process that right now. Please try again.");
}

/** No reply arrived (timeout, cancel, network). Cancels are thrown; the rest may be retried. */
async function settleOpenRouterTransportError(
  ctx: CallContext,
  finish: FinishCall,
  err: unknown,
  httpStatus: number | null,
  estimate: number,
): Promise<AttemptResult> {
  const aborted = err instanceof DOMException && err.name === 'AbortError';
  const cancelled = ctx.signal.aborted;
  // Timed out or cancelled mid-flight: the provider may still bill it, so keep the estimate.
  await finish({
    status: 'error',
    httpStatus,
    costUsd: estimate,
    costIsEstimate: true,
    error: cancelled ? 'cancelled by app' : aborted ? 'timeout' : String(err).slice(0, 500),
  });
  if (cancelled) throw cancelledError();
  const message = aborted ? 'The AI took too long to answer. Please try again.' : 'Could not reach the AI service.';
  return { ok: false, error: new HttpError(504, 'ai_timeout', message), retryable: true };
}

/** Reads the model's JSON answer, tolerating ``` fences or stray text around the object. */
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

// ---------------------------------------------------------------------------
// 14. Small shared helpers
// ---------------------------------------------------------------------------

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object';
}

function finiteOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function decodeBase64(b64: string): Uint8Array {
  try {
    const clean = b64.includes(',') && b64.startsWith('data:') ? b64.slice(b64.indexOf(',') + 1) : b64;
    const bin = atob(clean);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    throw badRequest('The file data was corrupted in transit.');
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

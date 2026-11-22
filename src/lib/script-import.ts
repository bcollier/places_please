import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { extractDocumentText, parseScriptChunk } from '@/lib/ai';
import { AppError, CancelledError, withRetry } from '@/lib/errors';
import { readUriAsBase64 } from '@/lib/file-base64';
import { mergeParsedChunk, normalizeCharacterName, uniqueCharacters } from '@/lib/script-model';
import type { Gender, ScriptLine, ScriptSource } from '@/lib/types';

export type PageImage = { uri: string; width: number; height: number };

export type PickedDocument = { uri: string; name: string; kind: 'pdf' | 'docx'; size: number | null };

export type ImportProgress = { step: string; done: number; total: number };

/** `controller` aborts the in-flight network request when the user cancels. */
export type CancelToken = { cancelled: boolean; controller?: AbortController };

const MAX_PAGES = 40;
const IMAGES_PER_CHUNK = 3;
const TEXT_CHARS_PER_CHUNK = 7000;
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const MAX_IMAGE_WIDTH = 1600;

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// ---------------------------------------------------------------------------
// Pickers
// ---------------------------------------------------------------------------

export async function takePhoto(): Promise<PageImage | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new AppError(
      'Camera access is off. Turn it on in Settings › Places, Please to photograph script pages.',
      'permission',
      false,
    );
  }
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85, exif: false });
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  return { uri: a.uri, width: a.width, height: a.height };
}

export async function choosePhotos(): Promise<PageImage[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    orderedSelection: true,
    selectionLimit: MAX_PAGES,
    quality: 0.85,
    exif: false,
  });
  if (result.canceled) return [];
  return (result.assets ?? []).map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
}

export async function chooseDocument(): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', DOCX_MIME],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets?.[0]) return null;
  const a = result.assets[0];
  const name = a.name ?? 'script';
  const lower = name.toLowerCase();
  const kind: 'pdf' | 'docx' | null =
    a.mimeType === 'application/pdf' || lower.endsWith('.pdf')
      ? 'pdf'
      : a.mimeType === DOCX_MIME || lower.endsWith('.docx')
        ? 'docx'
        : null;
  if (!kind) {
    throw new AppError(
      lower.endsWith('.doc')
        ? 'Older .doc files aren’t supported. Save it as .docx or PDF and try again.'
        : 'Please choose a PDF or Word (.docx) file.',
      'bad_file',
      false,
    );
  }
  if (a.size && a.size > MAX_DOCUMENT_BYTES) {
    throw new AppError('That file is over 10 MB. Try a smaller PDF, or photograph just your scenes.', 'too_large', false);
  }
  return { uri: a.uri, name, kind, size: a.size ?? null };
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

export type ImportResult = {
  title: string | null;
  lines: ScriptLine[];
  characters: string[];
  genders: Record<string, Gender>;
  source: ScriptSource;
};

function checkCancelled(token: CancelToken) {
  if (token.cancelled) throw new CancelledError();
}

async function imageToBase64(page: PageImage): Promise<string> {
  try {
    const context = ImageManipulator.manipulate(page.uri);
    if (page.width > MAX_IMAGE_WIDTH) context.resize({ width: MAX_IMAGE_WIDTH });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ base64: true, compress: 0.7, format: SaveFormat.JPEG });
    if (!saved.base64) throw new Error('no base64');
    return saved.base64;
  } catch (err) {
    console.warn('[import] image prep failed', err);
    throw new AppError("One of the photos couldn't be read. Try retaking it.", 'bad_image', false);
  }
}

type Accumulator = { title: string | null; lines: ScriptLine[]; genders: Record<string, Gender> };

async function parseChunk(
  acc: Accumulator,
  input: Parameters<typeof parseScriptChunk>[0],
  chunkIndex: number,
  chunkCount: number,
  token: CancelToken,
) {
  checkCancelled(token);
  const last = acc.lines[acc.lines.length - 1];
  const result = await withRetry(
    () => {
      checkCancelled(token); // a retry after Cancel stops here
      return parseScriptChunk(
        input,
        {
          knownCharacters: uniqueCharacters(acc.lines),
          lastSpeaker: last?.character ?? null,
          lastScene: last?.scene ?? null,
          chunkIndex,
          chunkCount,
        },
        token.controller?.signal,
      ).catch((err) => {
        if (token.cancelled) throw new CancelledError();
        throw err;
      });
    },
    2,
    1500,
  );
  checkCancelled(token);
  acc.title = acc.title ?? result.title;
  acc.lines = mergeParsedChunk(acc.lines, result.lines);
  for (const c of result.characters ?? []) {
    const name = normalizeCharacterName(c.name);
    if (name && (c.gender === 'female' || c.gender === 'male') && !acc.genders[name]) acc.genders[name] = c.gender;
  }
}

export async function importFromPhotos(
  pages: PageImage[],
  onProgress: (p: ImportProgress) => void,
  token: CancelToken,
): Promise<ImportResult> {
  if (pages.length === 0) throw new AppError('Add at least one page first.', 'empty', false);
  if (pages.length > MAX_PAGES) throw new AppError(`Please use ${MAX_PAGES} pages or fewer.`, 'too_many', false);

  const acc: Accumulator = { title: null, lines: [], genders: {} };
  const chunkCount = Math.ceil(pages.length / IMAGES_PER_CHUNK);

  for (let c = 0; c < chunkCount; c++) {
    const chunk = pages.slice(c * IMAGES_PER_CHUNK, (c + 1) * IMAGES_PER_CHUNK);
    const firstPage = c * IMAGES_PER_CHUNK + 1;
    const lastPage = firstPage + chunk.length - 1;
    onProgress({
      step: firstPage === lastPage ? `Reading page ${firstPage}` : `Reading pages ${firstPage}–${lastPage}`,
      done: c,
      total: chunkCount,
    });
    const images: string[] = [];
    for (const page of chunk) {
      checkCancelled(token);
      images.push(await imageToBase64(page));
    }
    await parseChunk(acc, { kind: 'images', images }, c, chunkCount, token);
  }
  onProgress({ step: 'Done', done: chunkCount, total: chunkCount });
  return finish(acc, 'photos');
}

export async function importFromDocument(
  doc: PickedDocument,
  onProgress: (p: ImportProgress) => void,
  token: CancelToken,
): Promise<ImportResult> {
  onProgress({ step: 'Opening file', done: 0, total: 1 });
  let base64: string;
  try {
    base64 = await readUriAsBase64(doc.uri);
  } catch (err) {
    console.warn('[import] read file failed', err);
    throw new AppError("Couldn't open that file. Try choosing it again.", 'bad_file', false);
  }
  checkCancelled(token);

  const extracted = await withRetry(
    () => {
      checkCancelled(token);
      return extractDocumentText(doc.kind, base64, token.controller?.signal).catch((err) => {
        if (token.cancelled) throw new CancelledError();
        throw err;
      });
    },
    2,
    1500,
  );
  checkCancelled(token);

  const pages = extracted.pages.map((p) => p.trim());
  const totalChars = pages.reduce((n, p) => n + p.length, 0);
  const acc: Accumulator = { title: null, lines: [], genders: {} };

  // A PDF with almost no text is a scan: let the AI read the page images directly.
  if (doc.kind === 'pdf' && totalChars < Math.max(200, pages.length * 40)) {
    onProgress({ step: 'Reading scanned pages', done: 0, total: 1 });
    await parseChunk(acc, { kind: 'pdf', base64 }, 0, 1, token);
    onProgress({ step: 'Done', done: 1, total: 1 });
    return finish(acc, 'pdf');
  }
  if (totalChars === 0) {
    throw new AppError('That file has no text in it. Try photographing the pages instead.', 'empty', false);
  }

  const chunks = chunkText(pages, TEXT_CHARS_PER_CHUNK);
  for (let c = 0; c < chunks.length; c++) {
    onProgress({ step: `Reading part ${c + 1} of ${chunks.length}`, done: c, total: chunks.length });
    await parseChunk(acc, { kind: 'text', text: chunks[c] }, c, chunks.length, token);
  }
  onProgress({ step: 'Done', done: chunks.length, total: chunks.length });
  return finish(acc, doc.kind);
}

function finish(acc: Accumulator, source: ScriptSource): ImportResult {
  if (acc.lines.length === 0) {
    throw new AppError(
      "We couldn't find any dialogue. Make sure the pages show character names and their lines clearly.",
      'no_dialogue',
      false,
    );
  }
  const characters = uniqueCharacters(acc.lines);
  const genders: Record<string, Gender> = {};
  for (const c of characters) if (acc.genders[c]) genders[c] = acc.genders[c];
  return { title: acc.title, lines: acc.lines, characters, genders, source };
}

/** Groups page texts into chunks under maxChars, splitting very long pages on blank lines. */
export function chunkText(pages: string[], maxChars: number): string[] {
  const pieces: string[] = [];
  for (const page of pages) {
    if (page.length <= maxChars) {
      if (page) pieces.push(page);
      continue;
    }
    let current = '';
    for (const para of page.split(/\n\s*\n/)) {
      if (current && current.length + para.length + 2 > maxChars) {
        pieces.push(current);
        current = '';
      }
      if (para.length > maxChars) {
        for (let i = 0; i < para.length; i += maxChars) pieces.push(para.slice(i, i + maxChars));
      } else {
        current = current ? `${current}\n\n${para}` : para;
      }
    }
    if (current) pieces.push(current);
  }

  const chunks: string[] = [];
  let current = '';
  for (const piece of pieces) {
    if (current && current.length + piece.length + 2 > maxChars) {
      chunks.push(current);
      current = '';
    }
    current = current ? `${current}\n\n${piece}` : piece;
  }
  if (current) chunks.push(current);
  return chunks;
}

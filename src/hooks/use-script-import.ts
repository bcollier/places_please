import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';

import { AppError, isCancelled, toUserMessage } from '@/lib/errors';
import {
  chooseDocument,
  choosePhotos,
  importFromDocument,
  importFromPhotos,
  takePhoto,
  type CancelToken,
  type ImportProgress,
  type ImportResult,
  type PageImage,
  type PickedDocument,
} from '@/lib/script-import';
import { useAuth } from '@/providers/auth-provider';
import { useData } from '@/providers/data-provider';

export type ImportStage =
  | { kind: 'choose' }
  | { kind: 'pages' }
  | { kind: 'processing'; progress: ImportProgress }
  | { kind: 'review'; result: ImportResult };

type ImportSource = { kind: 'photos'; pages: PageImage[] } | { kind: 'doc'; doc: PickedDocument };

const MAX_PAGES = 40;

function importFrom(source: ImportSource, onProgress: (p: ImportProgress) => void, token: CancelToken) {
  return source.kind === 'photos'
    ? importFromPhotos(source.pages, onProgress, token)
    : importFromDocument(source.doc, onProgress, token);
}

function fallbackTitle(source: ImportSource): string {
  return source.kind === 'doc' ? source.doc.name.replace(/\.(pdf|docx)$/i, '') : 'New script';
}

function cancelToken(token: CancelToken) {
  token.cancelled = true;
  token.controller?.abort();
}

/** Clears the error banner, runs a picker action, and shows its error (if any) in the banner. */
async function withErrorBanner(setError: (value: string | null) => void, action: () => Promise<void>) {
  setError(null);
  try {
    await action();
  } catch (err) {
    setError(toUserMessage(err));
  }
}

/** The error banner text, and whether it's a "sign in to import" error that should offer sign-in. */
function useImportError() {
  const [error, setErrorText] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const setError = (value: string | null, cause?: unknown) => {
    setErrorText(value);
    setNeedsSignIn(cause instanceof AppError && cause.code === 'not_allowed');
  };

  // Coming back from signing in: the "please sign in" message no longer applies.
  const { account } = useAuth();
  const signedIn = !account.isGuest;
  const [prevSignedIn, setPrevSignedIn] = useState(signedIn);
  if (signedIn !== prevSignedIn) {
    setPrevSignedIn(signedIn);
    if (signedIn && needsSignIn) setError(null);
  }

  return { error, needsSignIn, setError };
}

/** Hands out a token per import run; cancelling (or leaving the screen) stops the current one. */
function useImportCancellation() {
  const cancelRef = useRef<CancelToken>({ cancelled: false });

  useEffect(() => () => cancelToken(cancelRef.current), []);

  const startRun = (): CancelToken => {
    const token: CancelToken = { cancelled: false, controller: new AbortController() };
    cancelRef.current = token;
    return token;
  };
  const cancelRun = () => cancelToken(cancelRef.current);

  return { startRun, cancelRun };
}

/** Saves the reviewed script, then opens it in place of this screen. */
function useSaveImportedScript(setError: (value: string | null) => void) {
  const { addScript } = useData();
  const [saving, setSaving] = useState(false);

  const save = async (result: ImportResult, title: string, character: string | null) => {
    setSaving(true);
    setError(null);
    try {
      const created = await addScript({
        title: title.trim() || 'Untitled script',
        lines: result.lines,
        characters: result.characters,
        character_genders: result.genders,
        my_character: character,
        source_type: result.source,
      });
      router.replace({ pathname: '/scripts/[id]', params: { id: created.id } });
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return { saving, save };
}

/** Pages added from the camera or photo library, capped at MAX_PAGES. */
function usePageCapture(setError: (value: string | null) => void, onPagesAdded: () => void) {
  const [pages, setPages] = useState<PageImage[]>([]);

  const addFromCamera = () =>
    withErrorBanner(setError, async () => {
      const page = await takePhoto();
      if (page) {
        setPages((p) => [...p, page]);
        onPagesAdded();
      }
    });

  const addFromLibrary = () =>
    withErrorBanner(setError, async () => {
      const picked = await choosePhotos();
      if (picked.length) {
        setPages((p) => [...p, ...picked].slice(0, MAX_PAGES));
        onPagesAdded();
      }
    });

  const removePage = (index: number) => setPages((ps) => ps.filter((_, j) => j !== index));
  const clearPages = () => setPages([]);

  return { pages, addFromCamera, addFromLibrary, removePage, clearPages };
}

/** The whole "add a script" flow: gathering pages or a file, reading it, then reviewing and saving. */
export function useScriptImport() {
  const { error, needsSignIn, setError } = useImportError();
  const { startRun, cancelRun } = useImportCancellation();
  const { saving, save } = useSaveImportedScript(setError);
  const [stage, setStage] = useState<ImportStage>({ kind: 'choose' });
  const { pages, addFromCamera, addFromLibrary, removePage, clearPages } = usePageCapture(setError, () =>
    setStage({ kind: 'pages' }),
  );
  const [doc, setDoc] = useState<PickedDocument | null>(null);
  const [title, setTitle] = useState('');
  const [character, setCharacter] = useState<string | null>(null);

  const read = async (source: ImportSource) => {
    setError(null);
    const token = startRun();
    setStage({ kind: 'processing', progress: { step: 'Getting started', done: 0, total: 1 } });
    try {
      const onProgress = (progress: ImportProgress) => {
        if (!token.cancelled) setStage({ kind: 'processing', progress });
      };
      const result = await importFrom(source, onProgress, token);
      if (token.cancelled) return;
      setTitle(result.title ?? fallbackTitle(source));
      setCharacter(null);
      setStage({ kind: 'review', result });
    } catch (err) {
      if (isCancelled(err) || token.cancelled) return;
      setError(toUserMessage(err, "We couldn't read that script. Please try again."), err);
      setStage(source.kind === 'photos' ? { kind: 'pages' } : { kind: 'choose' });
    }
  };

  const pickDoc = () =>
    withErrorBanner(setError, async () => {
      const d = await chooseDocument();
      if (d) {
        setDoc(d);
        await read({ kind: 'doc', doc: d });
      }
    });

  const cancelProcessing = () => {
    cancelRun();
    setStage(pages.length ? { kind: 'pages' } : { kind: 'choose' });
  };

  const startOver = () => {
    clearPages();
    setDoc(null);
    setStage({ kind: 'choose' });
  };

  return {
    stage,
    pages,
    doc,
    error,
    needsSignIn,
    title,
    setTitle,
    character,
    setCharacter,
    saving,
    addFromCamera,
    addFromLibrary,
    pickDoc,
    removePage,
    readPages: () => read({ kind: 'photos', pages }),
    readDocAgain: (d: PickedDocument) => read({ kind: 'doc', doc: d }),
    cancelProcessing,
    saveScript: (result: ImportResult) => save(result, title, character),
    startOver,
  };
}

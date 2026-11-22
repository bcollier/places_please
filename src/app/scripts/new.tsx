import { Image } from 'expo-image';
import { router, Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
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
import { charactersByLineCount } from '@/lib/script-model';
import { goBack } from '@/lib/navigation';
import { useAuth } from '@/providers/auth-provider';
import { useData } from '@/providers/data-provider';

type Stage =
  | { kind: 'choose' }
  | { kind: 'pages' }
  | { kind: 'processing'; progress: ImportProgress }
  | { kind: 'review'; result: ImportResult };

export default function NewScriptScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { addScript } = useData();

  const [stage, setStage] = useState<Stage>({ kind: 'choose' });
  const [pages, setPages] = useState<PageImage[]>([]);
  const [doc, setDoc] = useState<PickedDocument | null>(null);
  const [error, setErrorText] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const setError = (value: string | null, cause?: unknown) => {
    setErrorText(value);
    setNeedsSignIn(cause instanceof AppError && cause.code === 'not_allowed');
  };
  const [title, setTitle] = useState('');
  const [character, setCharacter] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cancelRef = useRef<CancelToken>({ cancelled: false });

  useEffect(() => () => void (cancelRef.current.cancelled = true), []);

  // Coming back from signing in: the "please sign in" message no longer applies.
  const { account } = useAuth();
  const signedIn = !account.isGuest;
  const [prevSignedIn, setPrevSignedIn] = useState(signedIn);
  if (signedIn !== prevSignedIn) {
    setPrevSignedIn(signedIn);
    if (signedIn && needsSignIn) setError(null);
  }

  const run = async (source: { kind: 'photos'; pages: PageImage[] } | { kind: 'doc'; doc: PickedDocument }) => {
    setError(null);
    const token: CancelToken = { cancelled: false };
    cancelRef.current = token;
    setStage({ kind: 'processing', progress: { step: 'Getting started', done: 0, total: 1 } });
    try {
      const onProgress = (progress: ImportProgress) => {
        if (!token.cancelled) setStage({ kind: 'processing', progress });
      };
      const result =
        source.kind === 'photos'
          ? await importFromPhotos(source.pages, onProgress, token)
          : await importFromDocument(source.doc, onProgress, token);
      if (token.cancelled) return;
      const fallbackTitle = source.kind === 'doc' ? source.doc.name.replace(/\.(pdf|docx)$/i, '') : 'New script';
      setTitle(result.title ?? fallbackTitle);
      setCharacter(null);
      setStage({ kind: 'review', result });
    } catch (err) {
      if (isCancelled(err) || token.cancelled) return;
      setError(toUserMessage(err, "We couldn't read that script. Please try again."), err);
      setStage(source.kind === 'photos' ? { kind: 'pages' } : { kind: 'choose' });
    }
  };

  const cancelProcessing = () => {
    cancelRef.current.cancelled = true;
    setStage(pages.length ? { kind: 'pages' } : { kind: 'choose' });
  };

  const addFromCamera = async () => {
    setError(null);
    try {
      const page = await takePhoto();
      if (page) {
        setPages((p) => [...p, page]);
        setStage({ kind: 'pages' });
      }
    } catch (err) {
      setError(toUserMessage(err));
    }
  };

  const addFromLibrary = async () => {
    setError(null);
    try {
      const picked = await choosePhotos();
      if (picked.length) {
        setPages((p) => [...p, ...picked].slice(0, 40));
        setStage({ kind: 'pages' });
      }
    } catch (err) {
      setError(toUserMessage(err));
    }
  };

  const pickDoc = async () => {
    setError(null);
    try {
      const d = await chooseDocument();
      if (d) {
        setDoc(d);
        await run({ kind: 'doc', doc: d });
      }
    } catch (err) {
      setError(toUserMessage(err));
    }
  };

  const save = async (result: ImportResult) => {
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

  return (
    <>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Button title="Cancel" variant="ghost" size="small" onPress={goBack} disabled={saving} />
          ),
        }}
      />
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing.seven }]}
        keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={styles.inner}>
          {error ? (
            <Card style={[styles.errorCard, { backgroundColor: theme.missSoft, borderColor: theme.miss }]}>
              <Icon name="exclamationmark.circle.fill" size={20} color={theme.miss} />
              <View style={styles.flex}>
                <Text variant="callout" style={{ color: theme.text }}>
                  {error}
                </Text>
                {needsSignIn ? (
                  <Button
                    title="Sign in with email"
                    icon="envelope.fill"
                    size="small"
                    onPress={() => router.push('/account')}
                    style={styles.signIn}
                  />
                ) : null}
              </View>
            </Card>
          ) : null}

          {stage.kind === 'choose' ? (
            <>
              <Text variant="body" color="textSecondary">
                Add your script and we’ll pick out every character and line. Photos work best flat, well lit, one page at a time.
              </Text>
              <SourceOption
                icon="camera.fill"
                title="Photograph pages"
                description="Snap each page with the camera"
                onPress={addFromCamera}
              />
              <SourceOption
                icon="photo.on.rectangle"
                title="Choose photos"
                description="Pick page photos from your library, in order"
                onPress={addFromLibrary}
              />
              <SourceOption
                icon="doc.text"
                title="Upload PDF or Word"
                description="A .pdf or .docx file from Files"
                onPress={pickDoc}
              />
              {doc && error ? <Button title="Try that file again" variant="secondary" onPress={() => run({ kind: 'doc', doc })} /> : null}
            </>
          ) : null}

          {stage.kind === 'pages' ? (
            <>
              <Text variant="overline">
                {pages.length} page{pages.length === 1 ? '' : 's'}
              </Text>
              <View style={styles.grid}>
                {pages.map((p, i) => (
                  <View key={`${p.uri}-${i}`} style={[styles.thumbWrap, { borderColor: theme.border }]}>
                    <Image source={{ uri: p.uri }} style={styles.thumb} contentFit="cover" accessibilityLabel={`Page ${i + 1}`} />
                    <View style={[styles.pageNum, { backgroundColor: theme.background }]}>
                      <Text variant="caption" style={{ fontWeight: '700' }}>
                        {i + 1}
                      </Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Remove page ${i + 1}`}
                      hitSlop={8}
                      onPress={() => setPages((ps) => ps.filter((_, j) => j !== i))}
                      style={[styles.remove, { backgroundColor: theme.text }]}>
                      <Icon name="xmark" size={10} color={theme.background} />
                    </Pressable>
                  </View>
                ))}
              </View>
              <View style={styles.row}>
                <Button title="Camera" icon="camera.fill" variant="secondary" size="medium" onPress={addFromCamera} style={styles.flex} />
                <Button title="Library" icon="photo.on.rectangle" variant="secondary" size="medium" onPress={addFromLibrary} style={styles.flex} />
              </View>
              <Button
                title={`Read ${pages.length} page${pages.length === 1 ? '' : 's'}`}
                icon="sparkles"
                disabled={pages.length === 0}
                onPress={() => run({ kind: 'photos', pages })}
              />
            </>
          ) : null}

          {stage.kind === 'processing' ? (
            <Processing progress={stage.progress} onCancel={cancelProcessing} />
          ) : null}

          {stage.kind === 'review' ? (
            <Review
              result={stage.result}
              title={title}
              setTitle={setTitle}
              character={character}
              setCharacter={setCharacter}
              saving={saving}
              onSave={() => save(stage.result)}
              onStartOver={() => {
                setPages([]);
                setDoc(null);
                setStage({ kind: 'choose' });
              }}
            />
          ) : null}
        </View>
      </ScrollView>
    </>
  );
}

function SourceOption({
  icon,
  title,
  description,
  onPress,
}: {
  icon: Parameters<typeof Icon>[0]['name'];
  title: string;
  description: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Card onPress={onPress} accessibilityLabel={`${title}. ${description}`} style={styles.option}>
      <View style={[styles.optionIcon, { backgroundColor: theme.primarySoft }]}>
        <Icon name={icon} size={22} color={theme.primary} />
      </View>
      <View style={styles.flex}>
        <Text variant="heading">{title}</Text>
        <Text variant="callout" color="textSecondary">
          {description}
        </Text>
      </View>
      <Icon name="chevron.right" size={14} color={theme.textTertiary} />
    </Card>
  );
}

function Processing({ progress, onCancel }: { progress: ImportProgress; onCancel: () => void }) {
  const theme = useTheme();
  const fraction = progress.total > 0 ? Math.min(1, (progress.done + 0.35) / progress.total) : 0;
  return (
    <Card style={styles.processing}>
      <Icon name="sparkles" size={28} color={theme.primary} />
      <Text variant="title">Reading your script</Text>
      <Text variant="callout" color="textSecondary">
        {progress.step}… This can take a minute for longer scripts.
      </Text>
      <View style={[styles.track, { backgroundColor: theme.border }]} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(fraction * 100) }}>
        <View style={[styles.fill, { backgroundColor: theme.primary, width: `${Math.round(fraction * 100)}%` }]} />
      </View>
      <Button title="Cancel" variant="ghost" size="medium" onPress={onCancel} />
    </Card>
  );
}

function Review({
  result,
  title,
  setTitle,
  character,
  setCharacter,
  saving,
  onSave,
  onStartOver,
}: {
  result: ImportResult;
  title: string;
  setTitle: (t: string) => void;
  character: string | null;
  setCharacter: (c: string) => void;
  saving: boolean;
  onSave: () => void;
  onStartOver: () => void;
}) {
  const theme = useTheme();
  const counts = charactersByLineCount(result.lines);
  return (
    <>
      <Card style={styles.reviewHeader}>
        <Icon name="checkmark.circle.fill" size={24} color={theme.perfect} />
        <Text variant="callout" style={styles.flex}>
          Found {result.lines.length} lines for {counts.length} character{counts.length === 1 ? '' : 's'}. You can fix any line
          later from the script page.
        </Text>
      </Card>

      <View style={styles.field}>
        <Text variant="overline">Title</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Script title"
          placeholderTextColor={theme.textTertiary}
          maxLength={200}
          returnKeyType="done"
          style={[styles.input, { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border }]}
          accessibilityLabel="Script title"
        />
      </View>

      <View style={styles.field}>
        <Text variant="overline">Who are you playing?</Text>
        <View style={styles.chips}>
          {counts.map((c) => (
            <Chip
              key={c.name}
              label={c.name}
              detail={String(c.count)}
              selected={character === c.name}
              onPress={() => setCharacter(c.name)}
            />
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <Text variant="overline">Preview</Text>
        <Card style={styles.preview}>
          {result.lines.slice(0, 6).map((l) => (
            <View key={l.id} style={styles.previewLine}>
              <Text variant="caption" style={{ fontWeight: '700', color: l.character === character ? theme.primary : theme.textSecondary }}>
                {l.character}
              </Text>
              <Text variant="callout" numberOfLines={2}>
                {l.text}
              </Text>
            </View>
          ))}
          {result.lines.length > 6 ? (
            <Text variant="caption">…and {result.lines.length - 6} more</Text>
          ) : null}
        </Card>
      </View>

      <Button title={character ? 'Save script' : 'Choose your character to save'} icon="checkmark" disabled={!character} loading={saving} onPress={onSave} />
      <Button title="Start over" variant="ghost" size="medium" onPress={onStartOver} disabled={saving} />
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.four, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.four },
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: Spacing.three },
  errorCard: { flexDirection: 'row', gap: Spacing.three, alignItems: 'flex-start' },
  signIn: { alignSelf: 'flex-start', marginTop: Spacing.three },
  option: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  optionIcon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.three },
  thumbWrap: { width: 96, height: 128, borderRadius: Radius.small, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  thumb: { width: '100%', height: '100%' },
  pageNum: { position: 'absolute', left: 4, bottom: 4, borderRadius: 8, paddingHorizontal: 6 },
  remove: { position: 'absolute', right: 4, top: 4, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  processing: { alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.six },
  track: { width: '100%', height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  reviewHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  field: { gap: Spacing.two },
  input: { borderWidth: StyleSheet.hairlineWidth, borderRadius: Radius.medium, padding: Spacing.three, fontSize: 17 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  preview: { gap: Spacing.three },
  previewLine: { gap: 2 },
});

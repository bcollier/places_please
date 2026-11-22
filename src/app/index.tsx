import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ModeTile } from '@/components/mode-tile';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Icon } from '@/components/ui/icon';
import { EmptyState, ErrorView, LoadingView } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { listPracticeHistory } from '@/lib/api';
import { charactersByLineCount } from '@/lib/script-model';
import { lastScore, practiceStreak, sessionsThisWeek } from '@/lib/stats';
import type { PracticeSession, Script } from '@/lib/types';
import { warmupAvailable } from '@/lib/rehearsal/warmup';
import { useGenderGuess } from '@/hooks/use-gender-guess';
import { useAuth } from '@/providers/auth-provider';
import { useData } from '@/providers/data-provider';

type Mode = 'run' | 'warmup' | 'listen';

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { loading, error, scripts, currentScript, refresh, setCurrentScript } = useData();
  const { account } = useAuth();
  useGenderGuess(currentScript ?? undefined);
  const [history, setHistory] = useState<PracticeSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await listPracticeHistory(60));
    } catch {
      // Stats are a nice-to-have; the home screen still works without them.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadHistory();
    }, [loadHistory]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refresh(), loadHistory()]);
    setRefreshing(false);
  }, [refresh, loadHistory]);

  const openMode = (script: Script, mode: Mode) => {
    setCurrentScript(script.id);
    if (!script.my_character) {
      router.push({ pathname: '/scripts/[id]', params: { id: script.id, pick: '1' } });
      return;
    }
    router.push({ pathname: `/scripts/[id]/${mode}`, params: { id: script.id } });
  };

  if (loading) return <LoadingView />;
  if (error && scripts.length === 0) return <ErrorView message={error} onRetry={() => void refresh()} />;

  const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const otherScripts = scripts.filter((s) => s.id !== currentScript?.id);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + Spacing.seven }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
      <View style={styles.inner}>
        <View style={styles.header}>
          <View style={styles.flex}>
            <Text variant="overline" color="primary">
              {today}
            </Text>
            <Text variant="display" accessibilityRole="header">
              Places, Please
            </Text>
          </View>
          {account.isGuest ? (
            <Button title="Sign in" size="small" variant="secondary" onPress={() => router.push('/account')} style={styles.signIn} />
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={12}
            onPress={() => router.push('/settings')}
            style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.surface, opacity: pressed ? 0.7 : 1 }]}>
            <Icon name="gearshape" size={20} color={theme.textSecondary} />
          </Pressable>
        </View>

        {!currentScript ? (
          <Card>
            <EmptyState
              icon="theatermasks.fill"
              title="Your stage is empty"
              message="Photograph your script pages or upload a PDF or Word file. We'll find every character and line.">
              <Button
                title="Add your first script"
                icon="plus"
                onPress={() => router.push('/scripts/new')}
                style={styles.emptyButton}
              />
            </EmptyState>
          </Card>
        ) : (
          <>
            <CurrentScriptCard script={currentScript} />

            <View style={styles.section}>
              <ModeTile
                emphasis
                icon="mic.fill"
                title="Run Lines"
                description="Your AI scene partner reads cues and checks every word."
                onPress={() => openMode(currentScript, 'run')}
              />
              <ModeTile
                icon="rectangle.on.rectangle.angled"
                title="Warm Up"
                description="Flash cards: pick the line that follows each cue."
                disabled={!!currentScript.my_character && !warmupAvailable(currentScript.lines, currentScript.my_character)}
                onPress={() => openMode(currentScript, 'warmup')}
              />
              <ModeTile
                icon="headphones"
                title="Listen"
                description="Hear the scene read aloud. Works with the screen off."
                onPress={() => openMode(currentScript, 'listen')}
              />
            </View>

            <StatsRow history={history} />
          </>
        )}

        {scripts.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="overline">Your scripts</Text>
              <Button title="Add" icon="plus" size="small" variant="ghost" onPress={() => router.push('/scripts/new')} />
            </View>
            {[currentScript, ...otherScripts].filter(Boolean).map((s) => (
              <ScriptRow key={s!.id} script={s!} current={s!.id === currentScript?.id} />
            ))}
          </View>
        ) : null}

        {history.length > 0 ? (
          <Card onPress={() => router.push('/history')} accessibilityLabel="Practice history" style={styles.historyRow}>
            <Icon name="clock" size={20} color={theme.primary} />
            <Text variant="heading" style={styles.flex}>
              Practice history
            </Text>
            <Icon name="chevron.right" size={14} color={theme.textTertiary} />
          </Card>
        ) : null}
      </View>
    </ScrollView>
  );
}

function CurrentScriptCard({ script }: { script: Script }) {
  const theme = useTheme();
  const myCount = script.my_character ? script.lines.filter((l) => l.character === script.my_character).length : 0;
  const top = charactersByLineCount(script.lines).slice(0, 3);
  return (
    <Card
      onPress={() => router.push({ pathname: '/scripts/[id]', params: { id: script.id } })}
      accessibilityLabel={`Now rehearsing ${script.title}. Open script.`}
      style={styles.currentCard}>
      <Text variant="overline" color="primary">
        Now rehearsing
      </Text>
      <Text variant="title" numberOfLines={2}>
        {script.title}
      </Text>
      {script.my_character ? (
        <Text variant="callout" color="textSecondary">
          You play <Text variant="callout" style={{ fontWeight: '700', color: theme.text }}>{script.my_character}</Text>
          {` · ${myCount} line${myCount === 1 ? '' : 's'} of ${script.lines.length}`}
        </Text>
      ) : (
        <Text variant="callout" color="primary" style={{ fontWeight: '600' }}>
          Tap to choose your character ({top.map((c) => c.name).join(', ')}…)
        </Text>
      )}
    </Card>
  );
}

function StatsRow({ history }: { history: PracticeSession[] }) {
  const streak = practiceStreak(history);
  const week = sessionsThisWeek(history);
  const score = lastScore(history);
  return (
    <View style={styles.stats}>
      <Stat label="Day streak" value={String(streak)} icon="flame.fill" />
      <Stat label="This week" value={String(week)} icon="clock" />
      <Stat label="Last score" value={score === null ? '—' : `${Math.round(score)}%`} icon="sparkles" />
    </View>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: Parameters<typeof Icon>[0]['name'] }) {
  const theme = useTheme();
  return (
    <Card style={styles.stat} accessibilityLabel={`${label}: ${value}`}>
      <Icon name={icon} size={16} color={theme.primary} />
      <Text variant="title">{value}</Text>
      <Text variant="caption">{label}</Text>
    </Card>
  );
}

function ScriptRow({ script, current }: { script: Script; current: boolean }) {
  const theme = useTheme();
  return (
    <Card
      onPress={() => router.push({ pathname: '/scripts/[id]', params: { id: script.id } })}
      accessibilityLabel={`${script.title}${current ? ', current script' : ''}`}
      style={styles.scriptRow}>
      <View style={[styles.dot, { backgroundColor: current ? theme.primary : theme.border }]} />
      <View style={styles.flex}>
        <Text variant="bodyStrong" numberOfLines={1}>
          {script.title}
        </Text>
        <Text variant="caption">
          {script.my_character ? `${script.my_character} · ` : ''}
          {script.lines.length} lines
        </Text>
      </View>
      <Icon name="chevron.right" size={14} color={theme.textTertiary} />
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.four, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.five },
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.three },
  flex: { flex: 1 },
  signIn: { marginBottom: 4 },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  currentCard: { gap: Spacing.two },
  section: { gap: Spacing.three },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stats: { flexDirection: 'row', gap: Spacing.three },
  stat: { flex: 1, gap: 2, paddingVertical: Spacing.three },
  scriptRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three, paddingVertical: Spacing.three },
  dot: { width: 8, height: 8, borderRadius: 4 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  emptyButton: { alignSelf: 'stretch', marginTop: Spacing.four },
});

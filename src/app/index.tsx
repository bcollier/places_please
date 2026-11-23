import { router } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CurrentScriptCard } from '@/components/home/current-script-card';
import { EmptyStageCard } from '@/components/home/empty-stage-card';
import { HomeHeader } from '@/components/home/home-header';
import { LinkCard } from '@/components/home/link-card';
import { PracticeModes } from '@/components/home/practice-modes';
import { ScriptList } from '@/components/home/script-list';
import { StatsRow } from '@/components/home/stats-row';
import { ErrorView, LoadingView } from '@/components/ui/state-views';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useGenderGuess } from '@/hooks/use-gender-guess';
import { useHomeHistory } from '@/hooks/use-home-history';
import { useTheme } from '@/hooks/use-theme';
import { useData } from '@/providers/data-provider';

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { loading, error, scripts, currentScript, refresh } = useData();
  useGenderGuess(currentScript ?? undefined);
  const { history, refreshing, onRefresh } = useHomeHistory(refresh);

  if (loading) return <LoadingView />;
  if (error && scripts.length === 0) return <ErrorView message={error} onRetry={() => void refresh()} />;

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing.four, paddingBottom: insets.bottom + Spacing.seven }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}>
      <View style={styles.inner}>
        <HomeHeader />

        {!currentScript ? (
          <EmptyStageCard />
        ) : (
          <>
            <CurrentScriptCard script={currentScript} />
            <PracticeModes script={currentScript} />
            <StatsRow history={history} />
          </>
        )}

        {scripts.length > 0 ? <ScriptList scripts={scripts} currentScript={currentScript} /> : null}

        {history.length > 0 ? (
          <LinkCard icon="clock" title="Practice history" accessibilityLabel="Practice history" onPress={() => router.push('/history')} />
        ) : null}

        <LinkCard
          icon="gearshape"
          title="Settings & sound check"
          accessibilityLabel="Settings and sound check"
          onPress={() => router.push('/settings')}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: Spacing.four, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MaxContentWidth, gap: Spacing.five },
});

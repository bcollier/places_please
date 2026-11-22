import { DarkTheme, DefaultTheme, Stack, ThemeProvider, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ErrorView, LoadingView } from '@/components/ui/state-views';
import { Text } from '@/components/ui/text';
import { Colors, Spacing } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { config } from '@/lib/config';
import { AuthProvider, useAuth } from '@/providers/auth-provider';
import { DataProvider } from '@/providers/data-provider';

void SplashScreen.preventAutoHideAsync().catch(() => {});

/** Shown instead of a crash if any screen throws while rendering. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  console.error('[app] render error', error);
  return <ErrorView message="Something went wrong on this screen. Your scripts are safe." onRetry={retry} />;
}

function useNavigationTheme() {
  const scheme = useColorScheme();
  const dark = scheme === 'dark';
  const c = Colors[dark ? 'dark' : 'light'];
  const base = dark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: c.primary,
      background: c.background,
      card: c.background,
      text: c.text,
      border: c.border,
      notification: c.primary,
    },
  };
}

export default function RootLayout() {
  const navTheme = useNavigationTheme();
  const scheme = useColorScheme();

  useEffect(() => {
    // Our own loading view takes over from the splash screen right away.
    const t = setTimeout(() => void SplashScreen.hideAsync().catch(() => {}), 50);
    return () => clearTimeout(t);
  }, []);

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {config.isConfigured ? (
        <AuthProvider>
          <AuthGate>
            <DataProvider>
              <AppStack />
            </DataProvider>
          </AuthGate>
        </AuthProvider>
      ) : (
        <SetupNeeded />
      )}
    </ThemeProvider>
  );
}

function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  if (auth.status === 'loading') return <LoadingView message="Places, please…" />;
  if (auth.status === 'error') return <ErrorView message={auth.error} onRetry={auth.retry} />;
  return <>{children}</>;
}

function AppStack() {
  const theme = useTheme();
  // Screens with fixed (non-scrolling) layouts get an opaque header so nothing sits underneath it.
  const solidHeader = { headerTransparent: false, headerStyle: { backgroundColor: theme.background } };
  return (
    <Stack
      screenOptions={{
        headerTintColor: theme.primary,
        headerTitleStyle: { color: theme.text },
        headerShadowVisible: false,
        headerBackButtonDisplayMode: 'minimal',
        contentStyle: { backgroundColor: theme.background },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false, title: 'Home' }} />
      <Stack.Screen name="scripts/new" options={{ presentation: 'modal', title: 'Add a Script', ...solidHeader }} />
      <Stack.Screen name="scripts/[id]/index" options={{ title: 'Script' }} />
      <Stack.Screen
        name="scripts/[id]/run"
        options={{ presentation: 'fullScreenModal', title: 'Run Lines', gestureEnabled: false, ...solidHeader }}
      />
      <Stack.Screen name="scripts/[id]/warmup" options={{ presentation: 'fullScreenModal', title: 'Warm Up', ...solidHeader }} />
      <Stack.Screen name="scripts/[id]/listen" options={{ presentation: 'fullScreenModal', title: 'Listen', ...solidHeader }} />
      <Stack.Screen
        name="scripts/[id]/line/[lineId]"
        options={{ presentation: 'formSheet', title: 'Edit Line', sheetAllowedDetents: [0.75, 1], sheetGrabberVisible: true }}
      />
      <Stack.Screen name="account" options={{ presentation: 'modal', title: 'Account', ...solidHeader }} />
      <Stack.Screen name="history" options={{ title: 'Practice History' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
    </Stack>
  );
}

function SetupNeeded() {
  const theme = useTheme();
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.setup}>
        <Text variant="display">Places, Please</Text>
        <Text variant="title">One more step</Text>
        <Text variant="body" color="textSecondary">
          The app needs your Supabase project details. Copy <Text variant="bodyStrong">.env.example</Text> to{' '}
          <Text variant="bodyStrong">.env.local</Text>, fill in EXPO_PUBLIC_SUPABASE_URL and
          EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart the dev server.
        </Text>
        <View style={[styles.note, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text variant="callout" color="textSecondary">
            See README.md for the full setup: database migration, the AI edge function, and the OpenRouter key.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  setup: { padding: Spacing.five, gap: Spacing.four },
  note: { padding: Spacing.four, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
});

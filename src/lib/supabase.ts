import 'react-native-url-polyfill/auto';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

import { config } from '@/lib/config';
import { secureStorage } from '@/lib/secure-storage';

let client: SupabaseClient | null = null;

/**
 * Returns the shared Supabase client. Throws if the app isn't configured; the root layout
 * shows a setup screen in that case so this is never reached.
 */
export function getSupabase(): SupabaseClient {
  if (!config.isConfigured) {
    throw new Error('Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }
  if (!client) {
    client = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: secureStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });

    // Only refresh tokens while the app is in the foreground (recommended for React Native).
    if (Platform.OS !== 'web') {
      AppState.addEventListener('change', (state) => {
        if (!client) return;
        if (state === 'active') client.auth.startAutoRefresh();
        else client.auth.stopAutoRefresh();
      });
    }
  }
  return client;
}

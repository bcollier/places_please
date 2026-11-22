/**
 * Public app configuration from EXPO_PUBLIC_* environment variables (see .env.example).
 * Only public values belong here: the Supabase URL and the publishable/anon key are designed to ship
 * in apps and are protected by row level security. Secrets (like the OpenRouter key) live only in
 * the Supabase edge function.
 */

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '';

function isValidUrl(value: string) {
  return /^https:\/\/[^\s/]+/.test(value) || /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.)/.test(value);
}

export const config = {
  supabaseUrl,
  supabaseAnonKey,
  isConfigured: isValidUrl(supabaseUrl) && supabaseAnonKey.length > 20,
} as const;

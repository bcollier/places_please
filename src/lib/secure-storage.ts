import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Supabase auth storage backed by the iOS Keychain (expo-secure-store).
 * Values are split into chunks because SecureStore warns about values over ~2KB and a
 * Supabase session (access + refresh token) can exceed that.
 *
 * On web (development only) falls back to localStorage.
 */

const CHUNK_SIZE = 1800;
const options: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

// SecureStore keys may only contain alphanumerics, ".", "-" and "_".
function safeKey(key: string) {
  return key.replace(/[^A-Za-z0-9._-]/g, '_');
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return globalThis.localStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }
  try {
    const base = safeKey(key);
    const countRaw = await SecureStore.getItemAsync(`${base}.count`, options);
    if (countRaw === null) return null;
    const count = Number(countRaw);
    if (!Number.isInteger(count) || count < 0 || count > 100) return null;
    const parts: string[] = [];
    for (let i = 0; i < count; i++) {
      const part = await SecureStore.getItemAsync(`${base}.${i}`, options);
      if (part === null) return null; // corrupted: treat as signed out
      parts.push(part);
    }
    return parts.join('');
  } catch (err) {
    console.warn('[secure-storage] read failed', err);
    return null;
  }
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // ignore
    }
    return;
  }
  const base = safeKey(key);
  try {
    const countRaw = await SecureStore.getItemAsync(`${base}.count`, options);
    const count = Number(countRaw ?? 0);
    await SecureStore.deleteItemAsync(`${base}.count`, options);
    for (let i = 0; i < (Number.isInteger(count) ? Math.min(count, 100) : 0); i++) {
      await SecureStore.deleteItemAsync(`${base}.${i}`, options);
    }
  } catch (err) {
    console.warn('[secure-storage] delete failed', err);
  }
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(key, value);
    } catch {
      // ignore
    }
    return;
  }
  const base = safeKey(key);
  await removeItem(key);
  const count = Math.ceil(value.length / CHUNK_SIZE);
  for (let i = 0; i < count; i++) {
    await SecureStore.setItemAsync(`${base}.${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), options);
  }
  // Written last so a partially written value is never read back.
  await SecureStore.setItemAsync(`${base}.count`, String(count), options);
}

export const secureStorage = { getItem, setItem, removeItem };

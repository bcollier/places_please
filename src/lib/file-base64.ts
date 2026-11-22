import { File } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * Reads a picked file or recording as base64.
 * expo-file-system doesn't run in the browser, so on web we read the blob: / data: URL directly.
 */
export async function readUriAsBase64(uri: string): Promise<string> {
  if (Platform.OS !== 'web') return new File(uri).base64();
  if (uri.startsWith('data:')) return uri.slice(uri.indexOf(',') + 1);
  const blob = await (await fetch(uri)).blob();
  return blobToBase64(blob);
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

/** Deletes a local file; a no-op on web (browser blobs aren't files on disk). */
export function deleteLocalFile(uri: string | null) {
  if (!uri || Platform.OS === 'web') return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    // ignore
  }
}

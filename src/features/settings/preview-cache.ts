import { File } from 'expo-file-system';

import { previewsDirectory, writeBytes } from '@/services/storage';

/**
 * Preview audio lives in the previews/ library directory, keyed by previewCacheKey(). A consent
 * marker in the same directory records that the user accepted paid previews. All reads treat a
 * failure as "not there", because a preview can always be synthesized again.
 */

const CONSENT_FILE_NAME = 'paid-preview-consent';

export function previewFile(key: string): File {
  return new File(previewsDirectory(), `${key}.mp3`);
}

/** The cached file for a key, or null when it has not been synthesized yet. */
export function cachedPreview(key: string): File | null {
  try {
    const file = previewFile(key);
    return file.exists ? file : null;
  } catch {
    return null;
  }
}

export function savePreview(key: string, audio: ArrayBuffer): File {
  const file = previewFile(key);
  writeBytes(file, new Uint8Array(audio));
  return file;
}

export function hasPaidPreviewConsent(): boolean {
  try {
    return new File(previewsDirectory(), CONSENT_FILE_NAME).exists;
  } catch {
    return false;
  }
}

export function recordPaidPreviewConsent(): void {
  try {
    writeBytes(new File(previewsDirectory(), CONSENT_FILE_NAME), new Uint8Array([1]));
  } catch {
    // Without the marker the user is asked once more. That is the safe direction to fail.
  }
}

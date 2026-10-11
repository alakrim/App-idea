import { File } from 'expo-file-system';

import type { StorableAudio } from '@/core/narration/formats';
import { previewsDirectory, writeBytes } from '@/services/storage';

/**
 * Preview audio lives in the previews/ library directory, keyed by previewCacheKey(). MP3 clips
 * keep the `.mp3` name and WAV clips (PCM and WAV narrators) the `.wav` one. A consent marker in
 * the same directory records that the user accepted paid previews. All reads treat a failure as
 * "not there", because a preview can always be synthesized again.
 */

const CONSENT_FILE_NAME = 'paid-preview-consent';
const EXTENSIONS = ['mp3', 'wav'] as const;

function previewFile(key: string, extension: (typeof EXTENSIONS)[number]): File {
  return new File(previewsDirectory(), `${key}.${extension}`);
}

/** The cached clip for a key, in whichever format it was saved, or null when none exists. */
export function cachedPreview(key: string): File | null {
  for (const extension of EXTENSIONS) {
    try {
      const file = previewFile(key, extension);
      if (file.exists) return file;
    } catch {
      // A failed lookup is a miss. The clip is synthesized again.
    }
  }
  return null;
}

/** Saves a clip under the key, in the container it is stored in. */
export function savePreview(key: string, audio: StorableAudio): File {
  const file = previewFile(key, audio.mime === 'audio/wav' ? 'wav' : 'mp3');
  writeBytes(file, audio.bytes);
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

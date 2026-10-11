import { File } from 'expo-file-system';

import { computeCoverTint } from '@/features/shared/cover-tint';
import { coversDirectory, readBytes, writeBytes } from '@/services/storage';

export interface ImportedCover {
  /** Library copy of the picked image, under covers/. */
  uri: string;
  /** Average colour of the cover, as #RRGGBB. */
  tint: string;
}

const IMAGE_EXTENSION = /\.(jpe?g|png|webp)$/i;

/** Copies a picked image into the library and computes its tint. The picker's copy is left alone. */
export async function importCover(sourceUri: string, newId: () => string): Promise<ImportedCover> {
  const bytes = await readBytes(new File(sourceUri));
  const target = new File(coversDirectory(), `${newId()}.${extensionOf(sourceUri)}`);
  writeBytes(target, bytes);
  return { uri: target.uri, tint: await computeCoverTint(target.uri) };
}

function extensionOf(uri: string): string {
  const match = IMAGE_EXTENSION.exec(uri);
  return match?.[1] ? match[1].toLowerCase() : 'jpg';
}

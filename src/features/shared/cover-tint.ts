import { Image } from 'expo-image';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/** Neutral fallback when the average colour cannot be read. A dark slate that suits both themes. */
export const NEUTRAL_TINT = '#2A2E38';

/** Width of the downscaled sample. Small enough to be cheap, big enough to average well. */
const SAMPLE_WIDTH = 16;
const SAMPLE_HEIGHT = 24;

const BASE83_ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
const BASE83_INDEX: ReadonlyMap<string, number> = new Map(
  Array.from(BASE83_ALPHABET, (char, index) => [char, index]),
);
const DC_CHARS = 4;
const SIZE_FLAG_CHARS = 1;

/**
 * The average colour of a blurhash, as #RRGGBB. A 1x1 blurhash carries only the DC term, which is
 * the mean colour of the image in sRGB. Returns null for a malformed hash.
 */
export function blurhashAverageHex(hash: string): string | null {
  if (hash.length < SIZE_FLAG_CHARS + 1 + DC_CHARS) return null;
  const dc = decodeBase83(hash.slice(SIZE_FLAG_CHARS + 1, SIZE_FLAG_CHARS + 1 + DC_CHARS));
  if (dc === null) return null;
  const red = (dc >> 16) & 255;
  const green = (dc >> 8) & 255;
  const blue = dc & 255;
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function decodeBase83(text: string): number | null {
  let value = 0;
  for (const char of text) {
    const digit = BASE83_INDEX.get(char);
    if (digit === undefined) return null;
    value = value * 83 + digit;
  }
  return value;
}

/**
 * The cover's average colour, used to tint the series header. The cover is downscaled with
 * expo-image-manipulator, then averaged by expo-image's blurhash encoder at one component. Any
 * failure, including web where blurhash is not available, falls back to a neutral tint.
 */
export async function computeCoverTint(uri: string): Promise<string> {
  try {
    const sample = await manipulateAsync(
      uri,
      [{ resize: { width: SAMPLE_WIDTH, height: SAMPLE_HEIGHT } }],
      { format: SaveFormat.PNG },
    );
    const hash = await Image.generateBlurhashAsync(sample.uri, [1, 1]);
    return (hash === null ? null : blurhashAverageHex(hash)) ?? NEUTRAL_TINT;
  } catch {
    return NEUTRAL_TINT;
  }
}

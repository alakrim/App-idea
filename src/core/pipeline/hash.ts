/*
 * Input hashes for idempotent stages. A stage's job is keyed by a hash of its inputs, model and
 * prompt version, so a done job with the same hash is skipped. FNV-1a is not cryptographic. Two
 * 32-bit lanes with different offsets give 64 bits, which is plenty for change detection.
 */

const FNV_PRIME = 0x01000193;
const LANE_A_OFFSET = 0x811c9dc5;
const LANE_B_OFFSET = 0x6b8b4567;

function fnv1a(text: string, offset: number): number {
  let hash = offset;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  return hash >>> 0;
}

/** 16 hex characters for a string. */
export function hashText(text: string): string {
  return fnv1a(text, LANE_A_OFFSET).toString(16).padStart(8, '0') +
    fnv1a(text, LANE_B_OFFSET).toString(16).padStart(8, '0');
}

/** Hashes a list of inputs. Each part is JSON-encoded, so the order and the boundaries matter. */
export function stableHash(parts: readonly unknown[]): string {
  return hashText(JSON.stringify(parts));
}

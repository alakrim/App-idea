// Shared constants for the procedural base ambience pack (ADR-0005, R4). Build and verify both read these.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = join(here, '..', '..');
export const PACK_DIR = join(REPO_ROOT, 'assets', 'ambience', 'base');
export const MANIFEST_PATH = join(PACK_DIR, 'manifest.json');
export const LEDGER_PATH = join(REPO_ROOT, 'assets', 'ambience', 'LICENSES.json');

/** Ids must match the BASE_PACK_IDS in src/core/analysis/ambience-taxonomy.ts. */
export const BASE_BED_IDS = [
  'base_rain',
  'base_wind',
  'base_ocean',
  'base_crowd',
  'base_space_hum',
  'base_fire',
];

export const BUILD_SCRIPT = 'scripts/sounds/build-base-pack.mjs';
export const RECIPE_VERSION = 'base-pack-v1';
export const LICENSE_DATE = '2026-10-11';
export const SAMPLE_RATE = 44100;
export const LOOP_SECONDS = 60;
export const SAMPLES_PER_AAC_FRAME = 1024;

/**
 * The loop is a whole number of AAC frames (2584 frames = 60.0004 s), so it decodes to exactly its
 * own length. Each file carries ROLL_SAMPLES (two frames) of loop audio before and after the loop
 * region: the encoder then sees continuous audio at the loop edges. Playback reads the region
 * [loopStartMs, loopEndMs) from the manifest and never plays the rolls.
 */
export const LOOP_SAMPLES =
  Math.round((LOOP_SECONDS * SAMPLE_RATE) / SAMPLES_PER_AAC_FRAME) * SAMPLES_PER_AAC_FRAME;
export const ROLL_SAMPLES = 2 * SAMPLES_PER_AAC_FRAME;

export const TARGET_LUFS = -28;
export const LUFS_TOLERANCE = 1;
export const TRUE_PEAK_MAX_DBTP = -3;
export const DURATION_TOLERANCE_MS = 50;
export const SEAM_WINDOW_SECONDS = 0.05;
/**
 * Seam level rule: |dRMS| across the loop seam must be <= max(floor, p99 of the |dRMS| between
 * adjacent windows elsewhere in the same file). The floor is the absolute 2 dB from the brief.
 */
export const SEAM_RMS_FLOOR_DB = 2;
export const SEAM_RMS_PERCENTILE = 0.99;
/**
 * Seam jump rule: the wrap sample step must be <= max(6 x median step, p99.9 of the internal sample
 * steps / median). The 6x floor is from the brief. The percentile term is the same statistical
 * treatment as the level rule: AAC coding noise on low-frequency beds makes single-sample steps
 * vary by more than 6x even when the loop is continuous.
 */
export const SEAM_SPIKE_RATIO = 6;
export const SEAM_JUMP_PERCENTILE = 0.999;
export const MAX_PACK_BYTES = 3_000_000;

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
export const TARGET_LUFS = -28;
export const LUFS_TOLERANCE = 1;
export const TRUE_PEAK_MAX_DBTP = -3;
export const DURATION_TOLERANCE_MS = 50;
export const SEAM_WINDOW_SECONDS = 0.05;
export const SEAM_RMS_TOLERANCE_DB = 2;
export const SEAM_SPIKE_RATIO = 6;
export const MAX_PACK_BYTES = 3_000_000;

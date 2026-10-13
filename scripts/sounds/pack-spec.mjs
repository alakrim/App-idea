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

// Freesound beds (A3). Real recordings are CC0 only; the curation and overrides are reviewed in git.
export const REAL_DIR = join(REPO_ROOT, 'assets', 'ambience', 'real');
export const REAL_MANIFEST_PATH = join(REAL_DIR, 'manifest.json');
export const CURATION_DIR = join(REPO_ROOT, 'assets', 'ambience', 'curation');
export const OVERRIDES_PATH = join(CURATION_DIR, 'overrides.json');
/** Downloaded HQ previews. Git-ignored: the build re-fetches them when missing. */
export const PREVIEW_CACHE_DIR = join(REPO_ROOT, '.cache', 'freesound');
export const FREESOUND_BUILD_SCRIPT = 'scripts/sounds/build-freesound-pack.mjs';
export const FREESOUND_RECIPE_VERSION = 'freesound-v2';
/** The exact licence value Freesound reports for CC0 (the search filter name is "Creative Commons 0"). */
export const CC0_LICENSE_URL = 'http://creativecommons.org/publicdomain/zero/1.0/';
export const CC0_FILTER = 'license:"Creative Commons 0" duration:[30 TO 600]';
/**
 * A4 (architect's size decision): real beds at AAC-LC 48 kbps mono, 60 s loops, about 0.37 MB each,
 * so 50 to 60 beds fit in 24 MB. The A3 budget was 15 MB for 18 beds at 64 kbps.
 */
export const MAX_REAL_PACK_BYTES = 24_000_000;
/** Freesound allows 60 requests a minute and 2,000 a day. One request per 1.1 s keeps a safe margin. */
export const FREESOUND_MIN_INTERVAL_MS = 1100;
export const FREESOUND_MAX_RETRIES = 3;

// A4 screening (scripts/sounds/screen-run.mjs, screen/tag.py, screen/clap.py). Model files and their
// caches live under .cache/ (git-ignored): the venv, the PANNs checkpoint and labels in a fake HOME
// (the package reads $HOME/panns_data), and the Hugging Face cache for CLAP. Nothing is committed.
export const SCREEN_DIR = join(REPO_ROOT, 'scripts', 'sounds', 'screen');
export const CACHE_DIR = join(REPO_ROOT, '.cache');
export const SCREEN_PYTHON = join(CACHE_DIR, 'venv-screen', 'bin', 'python');
export const SCREEN_HOME = join(CACHE_DIR, 'panns-home');
export const SCREEN_HF_HOME = join(CACHE_DIR, 'hf-home');
export const SCREEN_WORK_DIR = join(CACHE_DIR, 'screen-work');
export const AUDIOSET_CSV_PATH = join(SCREEN_HOME, 'panns_data', 'class_labels_indices.csv');
export const SCREEN_TAG_SCRIPT = join(SCREEN_DIR, 'tag.py');
export const SCREEN_CLAP_SCRIPT = join(SCREEN_DIR, 'clap.py');
export const CLAP_MODEL = 'laion/clap-htsat-unfused';
/** Candidates screened per category: the top of the curation ranking. */
export const SCREEN_CANDIDATES = 8;

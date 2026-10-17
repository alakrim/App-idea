// Shared constants for the ambience pack (ADR-0005, R4, briefs SND1). Build, curation and verify all read these.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = join(here, '..', '..');
/** Every installed bed, procedural and sampled, with one manifest (assets/ambience/beds/manifest.json). */
export const PACK_DIR = join(REPO_ROOT, 'assets', 'ambience', 'beds');
export const MANIFEST_PATH = join(PACK_DIR, 'manifest.json');
export const LEDGER_PATH = join(REPO_ROOT, 'assets', 'ambience', 'LICENSES.json');
export const CURATION_DIR = join(REPO_ROOT, 'assets', 'ambience', 'curation');
/** The sampled beds the architect reviewed: one reviewed candidate per taxonomy category. */
export const PICKS_PATH = join(CURATION_DIR, 'picks.json');

/** Ledger rows written by the procedural build are owned by this script. */
export const BUILD_SCRIPT = 'scripts/sounds/build-base-pack.mjs';

export const SAMPLE_RATE = 44100;
export const SAMPLES_PER_AAC_FRAME = 1024;
/** Procedural beds and the default for sampled beds: a whole number of AAC frames (60.0004 s). */
export const LOOP_SECONDS = 60;
/** Brief SND1: a loop is 45 to 63 seconds, and starts on a frame boundary. */
export const MIN_LOOP_SECONDS = 45;
export const MAX_LOOP_SECONDS = 63;
export const LOOP_SAMPLES =
  Math.round((LOOP_SECONDS * SAMPLE_RATE) / SAMPLES_PER_AAC_FRAME) * SAMPLES_PER_AAC_FRAME;
/**
 * Each file carries ROLL_SAMPLES (two frames) of loop audio before and after the loop region, so the
 * encoder sees continuous audio at the loop edges. Playback reads [loopStartMs, loopEndMs) only.
 */
export const ROLL_SAMPLES = 2 * SAMPLES_PER_AAC_FRAME;
export const CROSSFADE_SECONDS = 3;
export const CROSSFADE_SAMPLES = CROSSFADE_SECONDS * SAMPLE_RATE;
/** Synthesis length and the offset of the loop window inside it (skips filter start-up). */
export const SYNTH_SECONDS = 75;
export const EDGE_TRIM_SECONDS = 6;
/** Sampled sources lose this much at each end (noisy starts and stops) before the window search. */
export const SOURCE_EDGE_TRIM_SECONDS = 1;

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
/** Brief SND1 budget: about 20 MB for the whole pack. */
export const MAX_PACK_BYTES = 20 * 1024 * 1024;

#!/usr/bin/env node
// Synthesizes the procedural base ambience pack (ADR-0005, R4 sections 5 and 6). Run: npm run sounds:build
//
// Pipeline per bed:
//   1. synthesize 75 s mono float noise with ffmpeg generators and filters (every random source is seeded)
//   2. take a 63 s window starting 6 s in (skips filter start-up), then build a seamless loop of
//      2584 AAC frames (60.0004 s) with R4's equal-power afade qsin crossfade (3 s overlap)
//   3. beds with tonal parts (space hum drones) add a tonal stem that is exactly periodic over the
//      loop and is NOT crossfaded. Every modulation rate and tone is snapped to a whole number of
//      cycles per loop, so the stem wraps without a seam. Only the noise is crossfaded, which is
//      where equal-power is correct (uncorrelated copies).
//   4. two-pass loudnorm to -28 LUFS (linear gain), true peak <= -3 dBTP
//   5. encode AAC-LC, mono, 44.1 kHz, 64 kbps as .m4a
//
// Determinism: anoisesrc is seeded with `s=`, and aevalsrc's random(n) is deterministic across runs
// (checked: identical sha256 on repeated runs). Rebuilds with the same ffmpeg build are byte-stable.
// Writes assets/ambience/base/manifest.json and the procedural rows of assets/ambience/LICENSES.json.

import { mkdir, mkdtemp, readFile, copyFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  decodeMono,
  measureLoudness,
  runFfmpeg,
  runFfmpegCapture,
  sha256File,
} from './ffmpeg-tools.mjs';
import {
  BASE_BED_IDS,
  BUILD_SCRIPT,
  LEDGER_PATH,
  LICENSE_DATE,
  LOOP_SECONDS,
  LUFS_TOLERANCE,
  MANIFEST_PATH,
  PACK_DIR,
  RECIPE_VERSION,
  SAMPLE_RATE,
  TARGET_LUFS,
  TRUE_PEAK_MAX_DBTP,
} from './pack-spec.mjs';

const SYNTH_SECONDS = 75;
/** The loop window starts this far into the synthesis, past the filter start-up transients. */
const EDGE_TRIM_SECONDS = 6;
const CROSSFADE_SECONDS = 3;
const SAMPLES_PER_AAC_FRAME = 1024;
/**
 * A loose LRA target keeps loudnorm in linear (constant-gain) mode. With a tight target (11 LU) the
 * ocean swell measured 11.1 LU, loudnorm switched to dynamic mode, and it reshaped the envelopes.
 */
const LRA_TARGET = 20;

// AAC-LC encodes whole 1024-sample frames. A loop that is a whole number of frames decodes back to
// exactly its own length (priming skip and end padding cancel). A 60 s loop is not a whole number
// of frames, so the loop is rounded to 2584 frames (60.0004 s) and the seam is not padded.
const LOOP_SAMPLES =
  Math.round((LOOP_SECONDS * SAMPLE_RATE) / SAMPLES_PER_AAC_FRAME) * SAMPLES_PER_AAC_FRAME;
const CROSSFADE_SAMPLES = CROSSFADE_SECONDS * SAMPLE_RATE;
const EDGE_SAMPLES = EDGE_TRIM_SECONDS * SAMPLE_RATE;
/** Loop source window: LOOP + CROSSFADE. The R4 recipe returns window - crossfade = LOOP. */
const WINDOW_SAMPLES = LOOP_SAMPLES + CROSSFADE_SAMPLES;
if (EDGE_SAMPLES + WINDOW_SAMPLES > SYNTH_SECONDS * SAMPLE_RATE) {
  throw new Error('loop window does not fit inside the synthesis');
}

const noise = (color, seed, amplitude = 0.5) =>
  `anoisesrc=d=${SYNTH_SECONDS}:c=${color}:r=${SAMPLE_RATE}:a=${amplitude}:s=${seed}`;
/** Per-sample expression source. random(n) is deterministic per ffmpeg build (see header). */
const expr = (formula) => `aevalsrc='${formula}':d=${SYNTH_SECONDS}:s=${SAMPLE_RATE}`;

/** Loop length in seconds: an exact whole number of AAC frames. */
const LOOP_T = LOOP_SAMPLES / SAMPLE_RATE;
/** Whole cycles per loop for a design rate (at least one). */
const cycles = (hz) => Math.max(1, Math.round(hz * LOOP_T));
/** The design rate snapped to k / LOOP_T, so it completes a whole number of cycles in the loop. */
const periodicHz = (hz) => cycles(hz) / LOOP_T;
/** Sine LFO on a loop-periodic rate, for use inside a volume expression (eval=frame). */
const lfo = (hz, phase = 0) =>
  `sin(2*PI*${cycles(hz)}*t/${LOOP_T.toFixed(12)}${phase >= 0 ? '+' : ''}${phase})`;
/** A loop-periodic rate formatted for filter options. */
const hz = (designHz) => periodicHz(designHz).toFixed(12);

// Each recipe is a list of ffmpeg filter-graph fragments; the last one must output [out].
// Slow modulation uses volume with eval=frame so the envelopes are sample-smooth and bounded.

/** Crowd murmur: six detuned formant bands of pink noise, each with its own slow random-looking gain. */
const CROWD_LAYERS = [
  { seed: 401, f: 520, q: 3, rates: [0.37, 0.91], phase: 1.3 },
  { seed: 402, f: 545, q: 3, rates: [0.29, 0.66], phase: 0.2 },
  { seed: 403, f: 1450, q: 3.5, rates: [0.53, 1.21], phase: 2.1 },
  { seed: 404, f: 1385, q: 3.5, rates: [0.41, 0.83], phase: 4.0 },
  { seed: 405, f: 2600, q: 4, rates: [0.73, 1.57], phase: 0.7 },
  { seed: 406, f: 340, q: 2, rates: [0.23, 0.57], phase: 2.9 },
];

const RECIPES = {
  base_rain: {
    noise: [
      `${noise('pink', 101)}[rain_a]`,
      `${noise('pink', 102)}[rain_b]`,
      `[rain_a][rain_b]amix=inputs=2:normalize=0,highpass=f=280,lowpass=f=8500,tremolo=f=${hz(0.11)}:d=0.12[sheet]`,
      // Sparse droplets: single-sample impulses at ~40/s with random sign and level, shaped by a resonant band-pass.
      `${expr('gt(random(0),0.9991)*(0.35+0.65*random(1))*(2*random(2)-1)')},bandpass=f=3800:width_type=q:w=2.5,volume=0.6[drops]`,
      '[sheet][drops]amix=inputs=2:normalize=0:weights=1 0.7[out]',
    ],
  },
  base_wind: {
    noise: [
      `${noise('brown', 201)},bandpass=f=320:width_type=q:w=0.9,tremolo=f=${hz(0.23)}:d=0.75[gusts]`,
      `${noise('brown', 202)},lowpass=f=900,volume='0.5+0.5*${lfo(1 / 23)}':eval=frame[swell]`,
      `${noise('pink', 203)},highpass=f=1800,lowpass=f=3500,tremolo=f=${hz(0.31)}:d=0.5[hiss]`,
      '[gusts][swell][hiss]amix=inputs=3:normalize=0:weights=1 0.8 0.25[out]',
    ],
  },
  base_ocean: {
    noise: [
      // Two brown-noise surf layers on ~8.6 s and ~10.4 s swells (brief: 7 to 11 s), snapped to whole cycles.
      `${noise('brown', 301)},lowpass=f=700,volume='0.12+0.88*pow(0.5+0.5*${lfo(1 / 8.6)},2)':eval=frame[surf]`,
      `${noise('brown', 302)},lowpass=f=500,volume='0.3+0.7*pow(0.5+0.5*${lfo(1 / 10.4, 1.1)},2)':eval=frame[surf2]`,
      // High-shelf wash that only shows on the peaks of the first swell.
      `${noise('pink', 303)},highshelf=f=2500:g=9,lowpass=f=6500,volume='pow(0.5+0.5*${lfo(1 / 8.6, -0.6)},6)':eval=frame,volume=0.5[wash]`,
      '[surf][surf2][wash]amix=inputs=3:normalize=0:weights=1 0.5 0.7[out]',
    ],
  },
  base_crowd: {
    noise: [
      ...CROWD_LAYERS.map(
        (layer, i) =>
          `${noise('pink', layer.seed)},bandpass=f=${layer.f}:width_type=q:w=${layer.q},` +
          `volume='0.5+0.3*${lfo(layer.rates[0])}+0.2*${lfo(layer.rates[1], layer.phase)}':eval=frame[c${i}]`,
      ),
      `${CROWD_LAYERS.map((_, i) => `[c${i}]`).join('')}amix=inputs=${CROWD_LAYERS.length}:normalize=0,highpass=f=140,lowpass=f=3800[out]`,
    ],
  },
  base_space_hum: {
    // Noise bed: crossfaded with the loop.
    noise: [`${noise('brown', 501)},lowpass=f=260,volume=0.5[out]`],
    // Drones: 55 Hz with a beat against 55.4 Hz, 110 Hz, a 82.5 Hz triangle and a 0.05 Hz swell. Every
    // rate is a whole number of cycles per loop, so the stem is periodic and wraps without a seam.
    // Its mix weight against the noise bed is 1 for the drones and 0.6 for the noise.
    tonal: {
      noiseWeight: 0.6,
      graph:
        `aevalsrc='(0.30*sin(2*PI*${hz(55)}*t)+0.18*sin(2*PI*${hz(55.4)}*t+1)+0.10*sin(2*PI*${hz(110)}*t+0.5)` +
        `+0.07*(4*abs(mod(${hz(82.5)}*t,1)-0.5)-1))*(0.8+0.2*sin(2*PI*${hz(0.05)}*t))'` +
        `:d=${SYNTH_SECONDS}:s=${SAMPLE_RATE},atrim=end_sample=${LOOP_SAMPLES},asetpts=PTS-STARTPTS[tonal]`,
    },
  },
  base_fire: {
    noise: [
      `${noise('brown', 601)},lowpass=f=380,volume='0.65+0.35*${lfo(0.31)}':eval=frame[rumble]`,
      // Crackle: high-passed random impulses (~66/s), gated by a slow cluster envelope so they bunch up.
      `${expr('gt(random(0),0.9985)*(2*random(1)-1)*(0.3+0.7*random(2))')},highpass=f=900,lowpass=f=7500,volume='0.25+0.75*pow(0.5+0.5*${lfo(0.17)},4)':eval=frame[pops]`,
      '[rumble][pops]amix=inputs=2:normalize=0:weights=1 0.9[out]',
    ],
  },
};

/**
 * Brown-noise layers carry a DC offset (about -0.03 FS) that AAC codes badly at frame edges, which
 * left a click at the loop seam. A 25 Hz high-pass removes it below audible ambience content.
 */
function finish(fragments) {
  return fragments.map((fragment) =>
    fragment.endsWith('[out]') ? fragment.replace(/\[out\]$/, ',highpass=f=25[out]') : fragment,
  );
}

/** Equal-power loop: tail fades out while head fades in, then the head is replaced by the crossfade. */
function loopGraph() {
  const x = CROSSFADE_SECONDS;
  return [
    `[0:a]atrim=start_sample=${EDGE_SAMPLES}:end_sample=${EDGE_SAMPLES + WINDOW_SAMPLES},asetpts=PTS-STARTPTS,asplit=3[w1][w2][w3]`,
    `[w1]atrim=start_sample=${LOOP_SAMPLES},asetpts=PTS-STARTPTS,afade=t=out:st=0:d=${x}:curve=qsin[tail]`,
    `[w2]atrim=end_sample=${CROSSFADE_SAMPLES},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=${x}:curve=qsin[head]`,
    '[tail][head]amix=inputs=2:duration=first:weights=1 1:normalize=0[xf]',
    `[w3]atrim=start_sample=${CROSSFADE_SAMPLES}:end_sample=${LOOP_SAMPLES},asetpts=PTS-STARTPTS[rest]`,
    '[xf][rest]concat=n=2:v=0:a=1[out]',
  ].join(';');
}

/** Pass 1 of two-pass loudnorm: measure the loop. */
async function measureLoudnorm(file) {
  const stderr = await runFfmpegCapture([
    '-i',
    file,
    '-af',
    `loudnorm=I=${TARGET_LUFS}:TP=${TRUE_PEAK_MAX_DBTP}:LRA=${LRA_TARGET}:print_format=json`,
    '-f',
    'null',
    '-',
  ]);
  const match = /\{[^{}]*"input_i"[^{}]*\}/.exec(stderr);
  if (!match) throw new Error(`loudnorm pass 1 produced no JSON for ${file}`);
  const m = JSON.parse(match[0]);
  return {
    I: m.input_i,
    TP: m.input_tp,
    LRA: m.input_lra,
    thresh: m.input_thresh,
    offset: m.target_offset,
  };
}

function loudnormPass2(m) {
  return [
    `loudnorm=I=${TARGET_LUFS}:TP=${TRUE_PEAK_MAX_DBTP}:LRA=${LRA_TARGET}`,
    `measured_I=${m.I}:measured_TP=${m.TP}:measured_LRA=${m.LRA}:measured_thresh=${m.thresh}`,
    `offset=${m.offset}:linear=true:print_format=summary`,
  ].join(':');
}

async function buildBed(id, workDir) {
  const recipe = RECIPES[id];
  if (!recipe) throw new Error(`no recipe for ${id}`);
  const graph = finish(recipe.noise).join(';');
  const synth = join(workDir, `${id}.synth.wav`);
  const loop = join(workDir, `${id}.loop.wav`);
  const mixed = join(workDir, `${id}.mixed.wav`);
  const encoded = join(workDir, `${id}.m4a`);

  await runFfmpeg([
    '-y',
    '-filter_complex',
    graph,
    '-map',
    '[out]',
    '-ac',
    '1',
    '-ar',
    String(SAMPLE_RATE),
    '-c:a',
    'pcm_f32le',
    synth,
  ]);
  await runFfmpeg([
    '-y',
    '-i',
    synth,
    '-filter_complex',
    loopGraph(),
    '-map',
    '[out]',
    '-c:a',
    'pcm_f32le',
    loop,
  ]);

  // Tonal stem is added after the loop, so it is never crossfaded (see header, step 3).
  let source = loop;
  if (recipe.tonal) {
    source = mixed;
    const mixGraph = `${recipe.tonal.graph};[0:a][tonal]amix=inputs=2:normalize=0:duration=first:weights=${recipe.tonal.noiseWeight} 1[out]`;
    await runFfmpeg([
      '-y',
      '-i',
      loop,
      '-filter_complex',
      mixGraph,
      '-map',
      '[out]',
      '-c:a',
      'pcm_f32le',
      mixed,
    ]);
  }

  const measured = await measureLoudnorm(source);
  await runFfmpeg([
    '-y',
    '-i',
    source,
    '-af',
    loudnormPass2(measured),
    '-ac',
    '1',
    '-ar',
    String(SAMPLE_RATE),
    '-c:a',
    'aac',
    '-profile:a',
    'aac_low',
    '-b:a',
    '64k',
    '-movflags',
    '+faststart',
    '-f',
    'ipod',
    encoded,
  ]);

  const samples = await decodeMono(encoded);
  const durationMs = Math.round((samples.length / SAMPLE_RATE) * 1000);
  const { integratedLufs, truePeakDbtp } = await measureLoudness(encoded);
  if (Math.abs(integratedLufs - TARGET_LUFS) > LUFS_TOLERANCE) {
    throw new Error(`${id}: integrated loudness ${integratedLufs} LUFS is outside the target`);
  }
  if (truePeakDbtp > TRUE_PEAK_MAX_DBTP) {
    throw new Error(`${id}: true peak ${truePeakDbtp} dBTP exceeds ${TRUE_PEAK_MAX_DBTP}`);
  }

  const file = `${id}.m4a`;
  await copyFile(encoded, join(PACK_DIR, file));
  const { size } = await stat(join(PACK_DIR, file));
  return {
    id,
    file,
    durationMs,
    loopStartMs: 0,
    loopEndMs: durationMs,
    lufs: Math.round(integratedLufs * 10) / 10,
    bytes: size,
    sha256: await sha256File(join(PACK_DIR, file)),
    kind: 'bed',
    source: 'procedural',
    recipeVersion: RECIPE_VERSION,
  };
}

/** Replaces only the procedural rows this script owns, so hand-added (sampled) licence rows survive. */
async function updateLedger(ids) {
  let existing = [];
  try {
    existing = JSON.parse(await readFile(LEDGER_PATH, 'utf8'));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  const kept = existing.filter((entry) => entry.source !== BUILD_SCRIPT);
  const procedural = ids.map((id) => ({
    id,
    file: `${id}.m4a`,
    license: 'Proprietary (generated in-house)',
    source: BUILD_SCRIPT,
    author: 'Lectio',
    date: LICENSE_DATE,
  }));
  await writeFile(LEDGER_PATH, `${JSON.stringify([...kept, ...procedural], null, 2)}\n`);
}

async function main() {
  const workDir = await mkdtemp(join(tmpdir(), 'lectio-base-pack-'));
  try {
    await mkdir(PACK_DIR, { recursive: true });
    const manifest = [];
    for (const id of BASE_BED_IDS) {
      console.log(`building ${id}`);
      const entry = await buildBed(id, workDir);
      console.log(
        `  ${entry.file}: ${entry.durationMs} ms, ${entry.lufs} LUFS, ${entry.bytes} bytes`,
      );
      manifest.push(entry);
    }
    await writeFile(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    await updateLedger(BASE_BED_IDS);
    const total = manifest.reduce((sum, e) => sum + e.bytes, 0);
    console.log(`wrote ${manifest.length} beds, ${total} bytes total`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});

// Procedural ambience recipes (ADR-0005, R4 sections 5 and 6, brief SND1). A recipe is ffmpeg filter
// graph text built from seeded noise, sample-exact expressions and loop-periodic LFOs.
//
// Two kinds of content:
//   - noise: crossfaded into a seamless loop by bed-encoder.mjs. An equal-power crossfade is right for
//     uncorrelated copies of noise.
//   - tonal: a stem that is exactly periodic over the loop. It is mixed after the crossfade and is never
//     crossfaded. Every rate and period is snapped to a whole number of cycles per loop (periods divide
//     the loop length), so the stem wraps without a seam.
// A recipe with only a tonal stem is periodic: nothing is crossfaded at all.

import { EDGE_TRIM_SECONDS, LOOP_SAMPLES, SAMPLE_RATE, SYNTH_SECONDS } from './pack-spec.mjs';

export const RECIPE_VERSION = 'bed-recipes-v3';

const LOOP_T = LOOP_SAMPLES / SAMPLE_RATE;
const EDGE_SAMPLES = EDGE_TRIM_SECONDS * SAMPLE_RATE;
/**
 * The period of a pulse train that divides the loop into `count` equal pulses, so it wraps exactly. A loop
 * is 60.0004 s, not 60 s, so a literal "1 s" period would leave a seam.
 */
const period = (count) => (LOOP_T / count).toFixed(12);
const HEART_PERIOD = period(60);
const CLOCK_PERIOD = period(30);
const CLOCK_HALF_PERIOD = (LOOP_T / 60).toFixed(12);
const CLACK_PERIOD = period(100);

/** Whole cycles per loop for a design rate (at least one). */
const cycles = (rateHz) => Math.max(1, Math.round(rateHz * LOOP_T));
/** The design rate snapped to k / LOOP_T, so it completes a whole number of cycles in the loop. */
const hz = (rateHz) => (cycles(rateHz) / LOOP_T).toFixed(12);
/** Sine LFO on a loop-periodic rate, for a volume expression (eval=frame). Bounded in [-1, 1]. */
const lfo = (rateHz, phase = 0) =>
  `sin(2*PI*${cycles(rateHz)}*t/${LOOP_T.toFixed(12)}${phase >= 0 ? '+' : ''}${phase})`;

const noise = (color, seed, amplitude = 0.5) =>
  `anoisesrc=d=${SYNTH_SECONDS}:c=${color}:r=${SAMPLE_RATE}:a=${amplitude}:s=${seed}`;
/** Per-sample expression source. random(n) is deterministic per ffmpeg build (see build-base-pack.mjs). */
const expr = (formula) => `aevalsrc='${formula}':d=${SYNTH_SECONDS}:s=${SAMPLE_RATE}`;

/**
 * A periodic tonal stem. It is generated over the whole synthesis, high-passed (so its start-up
 * transient falls before the window), then cut to exactly one loop starting at the edge trim.
 */
function tonal(formula, noiseWeight) {
  return {
    noiseWeight,
    graph:
      `${expr(formula)},highpass=f=25,` +
      `atrim=start_sample=${EDGE_SAMPLES}:end_sample=${EDGE_SAMPLES + LOOP_SAMPLES},` +
      'asetpts=PTS-STARTPTS[tonal]',
  };
}

/**
 * The noise section of every recipe ends in [out]. The 25 Hz high-pass is added there, before the
 * crossfade: brown-noise layers carry a DC offset that AAC codes badly at the loop seam (see R4).
 */
export function noiseGraph(fragments) {
  return fragments.map((fragment) =>
    fragment.endsWith('[out]') ? fragment.replace(/\[out\]$/, ',highpass=f=25[out]') : fragment,
  );
}

/**
 * Formant layers: pink noise through a band-pass, each with a base level and two slow gain LFOs.
 * Outputs [<tag>0] .. [<tag>N-1] and leaves the mixing to the caller.
 */
function formantLayers(layers, tag) {
  return layers.map(
    (layer, i) =>
      `${noise('pink', layer.seed)},bandpass=f=${layer.f}:width_type=q:w=${layer.q},` +
      `volume='${layer.base}+${layer.depth0}*${lfo(layer.rates[0])}+${layer.depth1}*${lfo(layer.rates[1], layer.phase)}':eval=frame[${tag}${i}]`,
  );
}

const tagList = (tag, count) => Array.from({ length: count }, (_, i) => `[${tag}${i}]`).join('');

/** Rain sheet: two pink layers, shaped and tremolo'd, plus sparse droplets through a resonant band. */
function rainNoise({ seed, sheetHigh, sheetLow, dropGate, dropFreq, dropLevel, sheetLevel }) {
  return [
    `${noise('pink', seed)}[ra]`,
    `${noise('pink', seed + 1)}[rb]`,
    `[ra][rb]amix=inputs=2:normalize=0,highpass=f=${sheetHigh},lowpass=f=${sheetLow},` +
      `tremolo=f=${hz(0.11)}:d=0.1,volume=${sheetLevel}[sheet]`,
    `${expr(`gt(random(0),${dropGate})*(0.35+0.65*random(1))*(2*random(2)-1)`)},` +
      `bandpass=f=${dropFreq}:width_type=q:w=2.5,volume=${dropLevel}[drops]`,
    '[sheet][drops]amix=inputs=2:normalize=0:weights=1 1[out]',
  ];
}

/** Crowd murmur layers (base_crowd): six detuned formant bands, each with its own slow gain. */
const CROWD_LAYERS = [
  { seed: 401, f: 520, q: 3, rates: [0.37, 0.91], phase: 1.3, base: 0.5, depth0: 0.3, depth1: 0.2 },
  { seed: 402, f: 545, q: 3, rates: [0.29, 0.66], phase: 0.2, base: 0.5, depth0: 0.3, depth1: 0.2 },
  { seed: 403, f: 1450, q: 3.5, rates: [0.53, 1.21], phase: 2.1, base: 0.5, depth0: 0.3, depth1: 0.2 },
  { seed: 404, f: 1385, q: 3.5, rates: [0.41, 0.83], phase: 4.0, base: 0.5, depth0: 0.3, depth1: 0.2 },
  { seed: 405, f: 2600, q: 4, rates: [0.73, 1.57], phase: 0.7, base: 0.5, depth0: 0.3, depth1: 0.2 },
  { seed: 406, f: 340, q: 2, rates: [0.23, 0.57], phase: 2.9, base: 0.5, depth0: 0.3, depth1: 0.2 },
];

/** Whisper layers (spirit_whispers): three narrow formant bands with slow, uneven gain. */
const WHISPER_LAYERS = [
  { seed: 881, f: 850, q: 4, rates: [0.37, 0.61], phase: 0.5, base: 0.35, depth0: 0.35, depth1: 0.2 },
  { seed: 882, f: 1500, q: 5, rates: [0.23, 0.44], phase: 2.2, base: 0.3, depth0: 0.3, depth1: 0.2 },
  { seed: 883, f: 2300, q: 5, rates: [0.51, 0.89], phase: 4.1, base: 0.25, depth0: 0.25, depth1: 0.15 },
];

/** Each recipe: `noise` (fragments ending in [out], crossfaded) and/or `tonal` (periodic stem). */
export const PROCEDURAL_RECIPES = {
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
      ...formantLayers(CROWD_LAYERS, 'c'),
      `${tagList('c', CROWD_LAYERS.length)}amix=inputs=${CROWD_LAYERS.length}:normalize=0,highpass=f=140,lowpass=f=3800[out]`,
    ],
  },
  base_space_hum: {
    noise: [`${noise('brown', 501)},lowpass=f=260,volume=0.5[out]`],
    // Drones: 55 Hz with a beat against 55.4 Hz, 110 Hz, a 82.5 Hz triangle and a 0.05 Hz swell.
    tonal: tonal(
      `(0.30*sin(2*PI*${hz(55)}*t)+0.18*sin(2*PI*${hz(55.4)}*t+1)+0.10*sin(2*PI*${hz(110)}*t+0.5)` +
        `+0.07*(4*abs(mod(${hz(82.5)}*t,1)-0.5)-1))*(0.8+0.2*sin(2*PI*${hz(0.05)}*t))`,
      0.6,
    ),
  },
  base_fire: {
    noise: [
      `${noise('brown', 601)},lowpass=f=380,volume='0.65+0.35*${lfo(0.31)}':eval=frame[rumble]`,
      // Crackle: high-passed random impulses (~66/s), gated by a slow cluster envelope so they bunch up.
      `${expr('gt(random(0),0.9985)*(2*random(1)-1)*(0.3+0.7*random(2))')},highpass=f=900,lowpass=f=7500,volume='0.25+0.75*pow(0.5+0.5*${lfo(0.17)},4)':eval=frame[pops]`,
      '[rumble][pops]amix=inputs=2:normalize=0:weights=1 0.9[out]',
    ],
  },

  forest_night: {
    noise: [
      `${noise('brown', 701)},lowpass=f=450,volume='0.3+0.2*${lfo(1 / 23)}':eval=frame[wind]`,
      `${noise('pink', 702)},highpass=f=900,lowpass=f=2500,tremolo=f=${hz(0.19)}:d=0.4,volume=0.12[rustle]`,
      '[wind][rustle]amix=inputs=2:normalize=0[out]',
    ],
    // Two crickets: gated 4.3 kHz and 4.7 kHz chirps on 1.25 s and 0.8 s periods, with a 9 Hz trill.
    tonal: tonal(
      `0.05*sin(2*PI*4300*t)*lt(mod(t,1.25),0.22)*(0.6+0.4*sin(2*PI*${hz(9)}*t))` +
        `+0.035*sin(2*PI*4700*t)*lt(mod(t,0.8),0.14)*(0.6+0.4*sin(2*PI*${hz(11)}*t))`,
      1,
    ),
  },
  light_rain: {
    noise: rainNoise({
      seed: 711,
      sheetHigh: 500,
      sheetLow: 6500,
      dropGate: 0.9994,
      dropFreq: 4200,
      dropLevel: 0.5,
      sheetLevel: 0.8,
    }),
  },
  heavy_rain: {
    noise: rainNoise({
      seed: 721,
      sheetHigh: 200,
      sheetLow: 5000,
      dropGate: 0.9982,
      dropFreq: 2600,
      dropLevel: 0.8,
      sheetLevel: 1.2,
    }),
  },
  rain_on_window: {
    noise: [
      // Droplets on glass: dense, bright and short, through a 3.2 kHz resonance.
      `${expr('gt(random(0),0.9978)*(0.4+0.6*random(1))*(2*random(2)-1)')},bandpass=f=3200:width_type=q:w=3,volume=0.7[glass]`,
      // Warm room tone behind the glass, and a faint distant sheet.
      `${noise('brown', 731)},lowpass=f=180,volume=0.4[room]`,
      `${noise('pink', 732)},highpass=f=1200,lowpass=f=4000,volume=0.15[sheet]`,
      '[glass][room][sheet]amix=inputs=3:normalize=0:weights=1 0.7 0.4[out]',
    ],
  },
  river_stream: {
    noise: [
      `${noise('brown', 741)},highpass=f=120,lowpass=f=1800,tremolo=f=${hz(0.45)}:d=0.25[water]`,
      `${noise('pink', 742)},bandpass=f=900:width_type=q:w=1.2,volume='0.4+0.6*pow(0.5+0.5*${lfo(0.8, 0.7)},3)':eval=frame[bubbles]`,
      `${expr('gt(random(0),0.9975)*(2*random(1)-1)*0.5')},highpass=f=1500,lowpass=f=6000,volume=0.4[sparkle]`,
      '[water][bubbles][sparkle]amix=inputs=3:normalize=0:weights=1 0.6 0.25[out]',
    ],
  },
  storm_wind: {
    noise: [
      `${noise('brown', 751)},bandpass=f=260:width_type=q:w=0.8,tremolo=f=${hz(0.19)}:d=0.7[gusts]`,
      `${noise('pink', 752)},highpass=f=1400,lowpass=f=4000,tremolo=f=${hz(0.27)}:d=0.5,volume=0.5[hiss]`,
      `${noise('brown', 753)},lowpass=f=90,volume='0.2+0.8*pow(0.5+0.5*${lfo(1 / 17, 0.5)},4)':eval=frame[rumble]`,
      `${expr('gt(random(0),0.997)*(2*random(1)-1)*0.6')},bandpass=f=3000:width_type=q:w=2,volume=0.4[rain]`,
      '[gusts][hiss][rumble][rain]amix=inputs=4:normalize=0:weights=1 0.5 0.8 0.4[out]',
    ],
  },
  blizzard_wind: {
    noise: [
      `${noise('brown', 761)},lowpass=f=1200,tremolo=f=${hz(0.34)}:d=0.8[gust]`,
      `${noise('pink', 762)},bandpass=f=900:width_type=q:w=1.5,volume='0.3+0.7*pow(0.5+0.5*${lfo(1 / 13, 1.4)},2)':eval=frame[howl]`,
      `${noise('pink', 763)},highpass=f=2500,lowpass=f=7000,tremolo=f=${hz(0.52)}:d=0.6,volume=0.3[snow]`,
      '[gust][howl][snow]amix=inputs=3:normalize=0:weights=1 0.8 0.35[out]',
    ],
  },
  mountain_wind: {
    noise: [
      `${noise('brown', 771)},lowpass=f=600,volume='0.4+0.6*pow(0.5+0.5*${lfo(1 / 31)},2)':eval=frame[wind]`,
      `${noise('pink', 772)},bandpass=f=1100:width_type=q:w=6,tremolo=f=${hz(0.11)}:d=0.6,volume=0.35[whistle]`,
      `${noise('brown', 773)},highpass=f=200,lowpass=f=1200,tremolo=f=${hz(0.23)}:d=0.3,volume=0.5[air]`,
      '[wind][whistle][air]amix=inputs=3:normalize=0:weights=1 0.35 0.6[out]',
    ],
  },
  snowfall_quiet: {
    noise: [
      `${noise('pink', 781)},lowpass=f=1100,volume='0.5+0.2*${lfo(1 / 29)}':eval=frame[hush]`,
      `${expr('gt(random(0),0.9993)*(2*random(1)-1)*0.4')},bandpass=f=6000:width_type=q:w=3,volume=0.25[flakes]`,
      `${noise('brown', 782)},lowpass=f=300,volume=0.2[bed]`,
      '[hush][flakes][bed]amix=inputs=3:normalize=0:weights=1 0.5 0.8[out]',
    ],
  },
  office_hum: {
    noise: [`${noise('pink', 791)},highpass=f=150,lowpass=f=2200,volume=0.3[out]`],
    // Mains hum at 60 Hz with its first two harmonics.
    tonal: tonal(
      `0.12*sin(2*PI*${hz(60)}*t)+0.05*sin(2*PI*${hz(120)}*t)+0.02*sin(2*PI*${hz(180)}*t)`,
      1,
    ),
  },
  library_quiet: {
    noise: [
      `${noise('pink', 801)},lowpass=f=500,volume=0.3[room]`,
      `${noise('brown', 802)},lowpass=f=150,volume=0.25[floor]`,
      '[room][floor]amix=inputs=2:normalize=0[out]',
    ],
  },
  airplane_cabin: {
    noise: [
      `${noise('brown', 811)},highpass=f=60,lowpass=f=1000,volume=0.5[air]`,
      `${noise('pink', 812)},lowpass=f=250,volume=0.3[hush]`,
      '[air][hush]amix=inputs=2:normalize=0[out]',
    ],
    // Engine drone at 110 Hz with a detuned partner and two harmonics.
    tonal: tonal(
      `0.10*sin(2*PI*${hz(110)}*t)+0.05*sin(2*PI*${hz(220)}*t+0.4)+0.03*sin(2*PI*${hz(330)}*t+1.1)` +
        `+0.04*sin(2*PI*${hz(111.3)}*t)`,
      0.6,
    ),
  },
  spaceship_engine: {
    noise: [
      `${noise('brown', 821)},lowpass=f=220,volume=0.5[rumble]`,
      `${noise('pink', 822)},highpass=f=800,lowpass=f=3000,volume=0.08[hiss]`,
      '[rumble][hiss]amix=inputs=2:normalize=0[out]',
    ],
    // Deep 36 Hz engine with a 2 Hz pulse and a 72 Hz harmonic.
    tonal: tonal(
      `0.28*sin(2*PI*${hz(36)}*t)*(0.75+0.25*sin(2*PI*${hz(2)}*t))+0.10*sin(2*PI*${hz(72)}*t+0.7)`,
      0.7,
    ),
  },
  starship_bridge: {
    noise: [`${noise('pink', 831)},lowpass=f=1600,volume=0.25[out]`],
    // Ship hum at 90 Hz and 180 Hz, and a faint console chirp at 900 Hz once every 4 s.
    tonal: tonal(
      `0.12*sin(2*PI*${hz(90)}*t)+0.06*sin(2*PI*${hz(180)}*t+0.3)` +
        `+0.03*sin(2*PI*${hz(900)}*t)*lt(mod(t,4),0.3)`,
      0.8,
    ),
  },
  ominous_drone: {
    noise: [`${noise('brown', 841)},lowpass=f=130,volume=0.4[out]`],
    // Dark detuned drone (41.2 Hz, 58.3 Hz, 82.4 Hz) with a 0.05 Hz swell.
    tonal: tonal(
      `(0.28*sin(2*PI*${hz(41.2)}*t)+0.22*sin(2*PI*${hz(58.3)}*t+1.2)+0.12*sin(2*PI*${hz(82.4)}*t+0.4))` +
        `*(0.8+0.2*sin(2*PI*${hz(0.05)}*t))`,
      0.8,
    ),
  },
  tense_heartbeat: {
    noise: [`${noise('pink', 851)},lowpass=f=350,volume=0.06[out]`],
    // Lub and dub at 60 bpm: a 55 Hz thump, then a 50 Hz thump 0.3 s later, each with a fast decay.
    tonal: tonal(
      `0.9*(lt(mod(t,${HEART_PERIOD}),0.16)*sin(2*PI*55*mod(t,${HEART_PERIOD}))*exp(-22*mod(t,${HEART_PERIOD}))` +
        `+0.7*gt(mod(t,${HEART_PERIOD}),0.3)*lt(mod(t,${HEART_PERIOD}),0.44)` +
        `*sin(2*PI*50*(mod(t,${HEART_PERIOD})-0.3))*exp(-30*(mod(t,${HEART_PERIOD})-0.3)))`,
      1,
    ),
  },
  clock_ticking: {
    noise: [`${noise('pink', 861)},lowpass=f=800,volume=0.14[out]`],
    // Tick-tock every 2 s: a 3.2 kHz tick, then a lower 2.4 kHz tock, each a 12 ms click. The clicks are
    // kept well under the room tone so the true peak stays under -3 dBTP after the loudness gain (0.15 measured -2.6 dBTP).
    tonal: tonal(
      `0.1*(lt(mod(t,${CLOCK_PERIOD}),0.012)*sin(2*PI*3200*mod(t,${CLOCK_PERIOD}))*exp(-350*mod(t,${CLOCK_PERIOD}))` +
        `+0.6*gt(mod(t,${CLOCK_PERIOD}),${CLOCK_HALF_PERIOD})*lt(mod(t,${CLOCK_PERIOD}),${CLOCK_HALF_PERIOD}+0.012)` +
        `*sin(2*PI*2400*(mod(t,${CLOCK_PERIOD})-${CLOCK_HALF_PERIOD}))*exp(-350*(mod(t,${CLOCK_PERIOD})-${CLOCK_HALF_PERIOD})))`,
      1,
    ),
  },
  qi_hum: {
    noise: [
      `${noise('pink', 871)},bandpass=f=4000:width_type=q:w=3,tremolo=f=${hz(0.4)}:d=0.6,volume=0.15[shimmer]`,
      `${noise('brown', 872)},lowpass=f=300,volume=0.3[murk]`,
      '[shimmer][murk]amix=inputs=2:normalize=0[out]',
    ],
    // Slow-beating detuned pair at 110 Hz and 111.5 Hz, a fifth above at 165 Hz, with a 0.05 Hz swell.
    tonal: tonal(
      `(0.22*sin(2*PI*${hz(110)}*t)+0.22*sin(2*PI*${hz(111.5)}*t+1)+0.12*sin(2*PI*${hz(165)}*t+2))` +
        `*(0.75+0.25*sin(2*PI*${hz(0.05)}*t))`,
      0.9,
    ),
  },
  spirit_whispers: {
    noise: [
      ...formantLayers(WHISPER_LAYERS, 'w'),
      `${tagList('w', WHISPER_LAYERS.length)}amix=inputs=${WHISPER_LAYERS.length}:normalize=0,highpass=f=300,lowpass=f=3000[whisper]`,
      `${noise('brown', 891)},lowpass=f=160,volume=0.25[pad]`,
      '[whisper][pad]amix=inputs=2:normalize=0:weights=1 0.6[out]',
    ],
  },
  train_interior: {
    noise: [`${noise('brown', 901)},highpass=f=40,lowpass=f=420,volume=0.6[out]`],
    // Rail joints: a clack every 0.6 s (100 per loop), a sharp 1.4 kHz transient with a fast decay.
    tonal: tonal(
      `0.7*lt(mod(t,${CLACK_PERIOD}),0.02)*sin(2*PI*1400*mod(t,${CLACK_PERIOD}))*exp(-150*mod(t,${CLACK_PERIOD}))`,
      1,
    ),
  },
};

/** Procedural bed ids, in the order the build writes them. */
export const PROCEDURAL_BED_IDS = Object.keys(PROCEDURAL_RECIPES);

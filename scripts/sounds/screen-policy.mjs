// The A4 screening policy: pure decisions over AudioSet tags (scripts/sounds/screen/tag.py) and the
// level of each second of a clip (ffmpeg-decoded PCM). No network, no model, no ffmpeg here.
//
// A window is a run of WINDOW_FRAMES one-second frames. It passes when:
//   1. no frame in it has a denied AudioSet class at or above DENY_FRAME_PROBABILITY (strict: one bad
//      second rejects the window),
//   2. every required group is present: in at least REQUIRED_FRACTION of its frames, the group's best
//      class is at or above REQUIRED_FRAME_PROBABILITY.
// Among passing windows the steadiest wins (the A3 rule): the lowest standard deviation of the level in dB.

import { WINDOW_SAMPLES } from './loop-recipe.mjs';
import { SAMPLE_RATE } from './pack-spec.mjs';

/** Denied when any frame reaches this AudioSet probability. Calibrated on the A3 siren clip (see the report). */
export const DENY_FRAME_PROBABILITY = 0.15;
export const REQUIRED_FRAME_PROBABILITY = 0.2;
export const REQUIRED_FRACTION = 0.5;
/** The 63 s window of the loop recipe, rounded up to whole one-second frames. */
export const WINDOW_FRAMES = Math.ceil(WINDOW_SAMPLES / SAMPLE_RATE);

/**
 * AudioSet families, matched on the display names. A family covers its parent class and every child
 * (`Civil defense siren` is a child of `Siren`, and the tagger scores each child separately). A bed
 * denies a family unless its target exempts the family or the single label (freesound-targets.mjs).
 */
export const FAMILY_PATTERNS = {
  alarms: /siren|alarm|foghorn|air horn|vehicle horn|car horn|train horn|train whistle|steam whistle|whistle|honk|smoke detector/i,
  percussion: /drum|cymbal|tambourine|rattle \(instrument\)|bell|chime|gong|xylophone|marimba|vibraphone|jingle/i,
  brass: /brass|trumpet|trombone|tuba|french horn|saxophone|bugle/i,
  music: /music|musical|instrument|guitar|piano|organ|synthesi|keyboard \(musical\)|string|violin|cello|bass(?! drum)|flute|harp|banjo|harmonica|accordion|bagpipe|ukulele|clarinet|woodwind|ringtone/i,
  voices: /speech|speaking|talk|babbl|whisper|shout|yell|bellow|scream|laugh|singing|\bsing\b|choir|chant|conversation|narration|hubbub|chatter|cheer|crowd|applause|dialogue|monologue/i,
  vehicles: /vehicle|\bcars?\b|car passing|trucks?|\bbus\b|motorcycle|motorboat|motor vehicle|\bboats?\b|\bships?\b|sailboat|rowboat|traffic|\btram\b|\btrains?\b|rail transport|railroad|subway|locomotive|aircraft|airplane|fixed-wing|helicopter|\bjet\b|propeller|race car|tyre|tire|skid|reversing/i,
  engines: /engine/i,
  tools: /jackhammer|chainsaw|power tool|drill|sawing|sewing|microwave|dental|generator|\btools\b|machine(?! gun)|mower|vacuum|blender|hair dryer/i,
  phones_media: /telephone|phone|ringtone|dial|busy signal|television|radio|beep|bleep/i,
  thunder: /thunder/i,
  gunfire: /gunshot|gunfire|machine gun|artillery|explosion|fireworks|firecracker|cannon|bang/i,
};

/** Families every bed denies. `voices` is lifted for voice categories (crowds, cafes, chants). */
const DENIED_FAMILIES = Object.keys(FAMILY_PATTERNS);

/** The AudioSet display names from the label CSV (class_labels_indices.csv: index, mid, display_name). */
export function parseAudiosetNames(csvText) {
  return csvText
    .split('\n')
    .slice(1)
    .map((line) => {
      const quoted = /^\d+,[^,]*,"(.*)"\s*$/.exec(line);
      return quoted ? quoted[1] : line.split(',').slice(2).join(',').trim();
    })
    .filter((name) => name.length > 0);
}

/**
 * The labels a target's policy denies: every name whose family is denied for it, minus its exemptions.
 * `exempt` holds family names and exact labels. Pure over the name list.
 */
export function familiesFor(target) {
  const exempt = new Set(target.screen.exempt);
  return DENIED_FAMILIES.filter(
    (family) => !exempt.has(family) && !(family === 'voices' && target.allowsVoices),
  );
}

export function denyLabelsFor(target, names) {
  const exempt = new Set(target.screen.exempt);
  const active = new Set(familiesFor(target));
  return names.filter((name) => {
    if (exempt.has(name)) return false;
    return DENIED_FAMILIES.some((family) => active.has(family) && FAMILY_PATTERNS[family].test(name));
  });
}

/**
 * A target's screening policy: the denied labels and the required groups, checked against the AudioSet
 * name list. A required name that is not an AudioSet label is an error, so it can never be inert.
 */
export function policyFor(target, names) {
  const known = new Set(names);
  const required = target.screen.required;
  for (const label of required.flat()) {
    if (!known.has(label)) throw new Error(`${target.id}: "${label}" is not an AudioSet label`);
  }
  return {
    deny: denyLabelsFor(target, names),
    required,
    clap: target.screen.clap,
  };
}

/** Every AudioSet display name a target's policy reads. tag.py is asked for exactly these. */
export function labelsFor(policy) {
  return [...new Set([...policy.deny, ...policy.required.flat()])];
}

/** Maps each AudioSet label to its column in a tag file's `perFrame` rows. */
function columnOf(labels) {
  return new Map(labels.map((label, index) => [label, index]));
}

/** For each frame, the denied classes at or above the frame threshold (empty when the frame is clean). */
export function deniedByFrame(tags, deny) {
  const column = columnOf(tags.labels);
  return tags.perFrame.map((row) =>
    deny.filter((label) => row[column.get(label)] >= DENY_FRAME_PROBABILITY),
  );
}

/** Per required group: the share of frames where its best class reaches the frame threshold. */
export function requiredFraction(tags, group, from, to) {
  const column = columnOf(tags.labels);
  const cols = group.map((label) => column.get(label));
  let hits = 0;
  for (let f = from; f < to; f += 1) {
    const row = tags.perFrame[f];
    if (cols.some((c) => row[c] >= REQUIRED_FRAME_PROBABILITY)) hits += 1;
  }
  return hits / (to - from);
}

/** Population standard deviation of the level in dB over [from, to). */
function stdDb(levelsDb, from, to) {
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += levelsDb[i];
  const mean = sum / (to - from);
  let square = 0;
  for (let i = from; i < to; i += 1) square += (levelsDb[i] - mean) ** 2;
  return Math.sqrt(square / (to - from));
}

/**
 * Screens one candidate. `tags` is tag.py's output; `levelsDb` is the dB level of each one-second
 * frame of the same clip. Returns the verdict with the evidence the curation record keeps.
 */
export function screenCandidate({ tags, levelsDb, policy }) {
  const frames = Math.min(tags.frames, levelsDb.length);
  const clip = { labels: tags.labels, perFrame: tags.perFrame.slice(0, frames) };
  const denied = deniedByFrame(clip, policy.deny);
  const deniedMax = deniedMaxima(clip, policy.deny);
  const clipRequired = policy.required.map((group) => ({
    group,
    fraction: requiredFraction(clip, group, 0, frames),
  }));
  const evidence = {
    frames,
    cleanSeconds: denied.filter((d) => d.length === 0).length,
    topClasses: tags.topClasses.slice(0, 5),
    deniedMax,
    requiredFraction: clipRequired.map((r) => ({ group: r.group, fraction: round(r.fraction) })),
  };
  const reject = (reason) => ({ verdict: 'reject', reason, window: null, evidence });

  if (frames < WINDOW_FRAMES) return reject(`clip has ${frames} s; a window needs ${WINDOW_FRAMES} s`);
  const absent = clipRequired.find((r) => r.fraction < REQUIRED_FRACTION);
  if (absent) return reject(`required sound absent: ${absent.group.join(' / ')}`);

  let best = null;
  for (let start = 0; start + WINDOW_FRAMES <= frames; start += 1) {
    const to = start + WINDOW_FRAMES;
    if (denied.slice(start, to).some((d) => d.length > 0)) continue;
    if (clipRequired.some((r) => requiredFraction(clip, r.group, start, to) < REQUIRED_FRACTION)) {
      continue;
    }
    const steadiness = stdDb(levelsDb, start, to);
    if (best === null || steadiness < best.steadiness) best = { startSeconds: start, steadiness };
  }
  if (best === null) {
    const worst = evidence.deniedMax[0];
    const why = worst
      ? `${worst.label} reaches ${worst.max} (at ${worst.atSecond} s)`
      : 'the required sounds are missing from every window';
    return reject(`no ${WINDOW_FRAMES} s window is free of denied sounds: ${why}`);
  }
  return {
    verdict: 'pass',
    reason: null,
    window: {
      startSeconds: best.startSeconds,
      lengthSeconds: WINDOW_FRAMES,
      steadinessDb: round(best.steadiness),
    },
    evidence,
  };
}

/** The highest probability each denied class reaches anywhere in the clip, with its second. */
function deniedMaxima(clip, deny) {
  const column = columnOf(clip.labels);
  const out = [];
  for (const label of deny) {
    const c = column.get(label);
    let max = 0;
    let at = -1;
    for (let f = 0; f < clip.perFrame.length; f += 1) {
      const p = clip.perFrame[f][c];
      if (p > max) {
        max = p;
        at = f;
      }
    }
    if (max >= DENY_FRAME_PROBABILITY) out.push({ label, max: round(max), atSecond: at });
  }
  return out.sort((a, b) => b.max - a.max);
}

/** The candidate to use: the highest CLAP score among passing candidates, ties to the earlier curation rank. */
export function chooseCandidate(candidates) {
  const passing = candidates.filter((c) => c.verdict === 'pass');
  if (passing.length === 0) return null;
  return passing.reduce((best, current) => {
    const a = best.clapScore ?? Number.NEGATIVE_INFINITY;
    const b = current.clapScore ?? Number.NEGATIVE_INFINITY;
    if (b !== a) return b > a ? current : best;
    return current.rank < best.rank ? current : best;
  });
}

const round = (value) => Math.round(value * 1000) / 1000;

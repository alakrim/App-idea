// Screens and scores sampled candidates for one target (brief SND1). A candidate is rejected when its
// licence is not allowed, when its title or description suggests music, speech or a broadcast, or when it
// has no target keyword. The screen runs before any network lookup; the score adds the duration rules.

import { classifyLicence } from './licence.mjs';
import { CROSSFADE_SECONDS, LOOP_SECONDS, SOURCE_EDGE_TRIM_SECONDS } from './pack-spec.mjs';

/** A source must hold the loop, the crossfade and the trimmed edges, with a little margin. */
export const MIN_SOURCE_SECONDS = LOOP_SECONDS + CROSSFADE_SECONDS + 2 * SOURCE_EDGE_TRIM_SECONDS + 3;
/** Longer files cost memory and time to decode, and field recordings rarely need more. */
export const MAX_SOURCE_SECONDS = 20 * 60;

const SPEECH_OR_MUSIC =
  /\b(music|musical|song|songs|track|remix|interview|speech|speaking|radio|podcast|talk|lecture|news|voices?|dialogue|band|album|concert|sermon|karaoke|piano|guitar|synth|beats?|dj|episode|soundtrack|theme|jingle)\b/i;

const FIELD_WORDS =
  /\b(ambience|ambient|ambiance|field recording|atmosphere|soundscape|background|room tone|environment)\b/i;

/**
 * Licence, speech/music and keyword screen. Returns { allowed, reason, hits, licence }. `hits` are the
 * target keywords found, and `candidate` carries title, description, licenseName and licenseUrl.
 */
export function screenCandidate(candidate, target) {
  const licence = classifyLicence({ name: candidate.licenseName, url: candidate.licenseUrl });
  if (!licence.allowed) return rejectScreen(licence.reason);
  const text = `${candidate.title} ${candidate.description ?? ''}`;
  const speech = SPEECH_OR_MUSIC.exec(text);
  if (speech) return rejectScreen(`title or description suggests speech or music ("${speech[0]}")`);
  const lower = text.toLowerCase();
  const hits = target.keywords.filter((word) => lower.includes(word.toLowerCase()));
  if (hits.length === 0) return rejectScreen('no target keyword in the title or description');
  return { allowed: true, reason: null, hits, licence };
}

/**
 * Full score for a screened candidate with a known duration. Returns { allowed, score, reasons, reason }.
 */
export function scoreCandidate(candidate, target, durationS) {
  const screen = screenCandidate(candidate, target);
  if (!screen.allowed) return { allowed: false, score: 0, reasons: [], reason: screen.reason };
  if (!(durationS >= MIN_SOURCE_SECONDS)) {
    return rejectScore(`${durationS} s is shorter than ${MIN_SOURCE_SECONDS} s`);
  }
  if (durationS > MAX_SOURCE_SECONDS) return rejectScore(`${durationS} s is longer than ${MAX_SOURCE_SECONDS} s`);

  const text = `${candidate.title} ${candidate.description ?? ''}`;
  const reasons = [`keywords: ${screen.hits.join(', ')}`, `${Math.round(durationS)} s`];
  let score = 2 * screen.hits.length;
  if (FIELD_WORDS.test(text)) {
    score += 1;
    reasons.push('describes an ambience or field recording');
  }
  // Longer recordings give more material to choose a steady window from, up to five minutes.
  score += Math.min(durationS, 300) / 300;
  return { allowed: true, score: Math.round(score * 100) / 100, reasons, reason: null };
}

function rejectScreen(reason) {
  return { allowed: false, reason, hits: [], licence: null };
}

function rejectScore(reason) {
  return { allowed: false, score: 0, reasons: [], reason };
}

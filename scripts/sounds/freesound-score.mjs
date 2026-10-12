// Scores Freesound search results for one A3 target (R5, brief A3 step 1). Pure functions only: the
// network lives in freesound-api.mjs and the curate script joins the two.

import { CC0_LICENSE_URL } from './pack-spec.mjs';

export const MIN_DURATION_SECONDS = 30;
export const MAX_DURATION_SECONDS = 600;
/** Clips under this length are too short to be a bed even after the loop is cut. */
const SHORT_CLIP_SECONDS = 45;
/** Telephone-band recordings (8 kHz) are audibly thin under a 64 kbps bed. */
const MIN_SAMPLE_RATE = 32000;
/** Bayesian prior for the rating: a sound with few ratings is pulled toward a neutral 3.5 of 5. */
const PRIOR_MEAN_RATING = 3.5;
const PRIOR_WEIGHT_RATINGS = 5;

const MUSIC_WORDS = [
  'music',
  'musical',
  'song',
  'songs',
  'melody',
  'melodic',
  'soundtrack',
  'chord',
  'chords',
  'beat',
  'beats',
  'orchestra',
  'piano',
  'guitar',
  'violin',
  'flute',
  'instrumental',
  'jingle',
  'bpm',
  'remix',
];
const SYNTH_WORDS = ['synth', 'synthesizer', 'synthetic', 'chiptune', 'edm'];
const SFX_WORDS = ['hit', 'hits', 'beep', 'beeps', 'bleep', 'blip', 'notification', 'chime'];
/**
 * Voices are the scene for crowds (tavern, cafe, market, city street), so those targets do not
 * penalise them. Everywhere else a person talking is a reason to reject the sound.
 */
const VOICE_WORDS = [
  'voice',
  'voices',
  'speech',
  'speaking',
  'talking',
  'talk',
  'talks',
  'dialogue',
  'dialog',
  'interview',
  'narration',
  'narrator',
  'vocal',
  'vocals',
  'spoken',
];

/** Lower-case word tokens of a string. Tags such as "field-recording" split into their words. */
export function tokens(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0);
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const round2 = (value) => Math.round(value * 100) / 100;

/**
 * Score for one Freesound sound against one target. Returns `{ excluded }` when the sound must not
 * be used at all (licence not exactly CC0, or duration outside 30 to 600 s), otherwise `{ score, reasons }`.
 * Higher is better. `reasons` lists every non-zero term, so the curation file explains the ranking.
 */
export function scoreSound(sound, target) {
  if (sound.license !== CC0_LICENSE_URL) {
    return { excluded: `licence is "${sound.license}", not exactly CC0` };
  }
  if (sound.duration < MIN_DURATION_SECONDS || sound.duration > MAX_DURATION_SECONDS) {
    return { excluded: `duration ${sound.duration.toFixed(1)} s is outside 30 to 600 s` };
  }

  const reasons = [];
  let score = 0;
  const add = (points, reason) => {
    score += points;
    if (reason !== undefined) reasons.push(`${points >= 0 ? '+' : ''}${round2(points)} ${reason}`);
  };

  const { avg_rating: avg, num_ratings: count, num_downloads: downloads } = sound;
  const bayes = (avg * count + PRIOR_MEAN_RATING * PRIOR_WEIGHT_RATINGS) /
    (count + PRIOR_WEIGHT_RATINGS);
  add(3 * clamp01((bayes - 1) / 4), `rating ${round2(avg)} from ${count} ratings`);
  add(2 * clamp01(Math.log10(downloads + 1) / 4), `${downloads} downloads`);

  const duration = sound.duration;
  if (duration >= 90) add(2, 'at least 90 s');
  else if (duration >= 63) add(1.5, 'at least 63 s');
  else if (duration >= 60) add(1, 'at least 60 s');
  else if (duration < SHORT_CLIP_SECONDS) add(-3, `only ${round2(duration)} s`);

  if (sound.samplerate < MIN_SAMPLE_RATE) add(-1, `sample rate ${sound.samplerate} Hz`);

  const tagWords = new Set(sound.tags.flatMap(tokens));
  const matchedTags = target.tags.filter((word) => tagWords.has(word));
  if (matchedTags.length > 0) {
    add(Math.min(3, matchedTags.length), `tags ${matchedTags.join(', ')}`);
  }

  const nameWords = tokens(sound.name);
  const matchedNames = target.names.filter((word) => nameWords.includes(word));
  if (matchedNames.length > 0) add(1, `name matches ${matchedNames.join(', ')}`);

  const everyWord = new Set([...tagWords, ...nameWords]);
  const hitsOf = (words) => words.filter((word) => everyWord.has(word));
  const musicHits = hitsOf(MUSIC_WORDS);
  if (musicHits.length > 0) add(-6, `music (${musicHits.join(', ')})`);
  if (everyWord.has('loop') && musicHits.length > 0) add(-2, 'loop with music');
  const synthHits = hitsOf(SYNTH_WORDS);
  if (synthHits.length > 0) add(-4, `synth (${synthHits.join(', ')})`);
  const sfxHits = hitsOf(SFX_WORDS);
  if (sfxHits.length > 0) add(-4, `sfx hit or beep (${sfxHits.join(', ')})`);
  const joinedName = ` ${nameWords.join(' ')} `;
  if (everyWord.has('oneshot') || joinedName.includes(' one shot ')) add(-4, 'one-shot clip');
  if (!target.allowsVoices) {
    const voiceHits = hitsOf(VOICE_WORDS);
    if (voiceHits.length > 0) add(-4, `voice or speech (${voiceHits.join(', ')})`);
  }

  return { score: round2(score), reasons };
}

/**
 * The best `limit` candidates for a target, highest score first. Ties go to the lower Freesound id,
 * so the same search always produces the same file.
 */
export function rankCandidates(sounds, target, limit = 5) {
  return sounds
    .map((sound) => ({ sound, result: scoreSound(sound, target) }))
    .filter((entry) => entry.result.excluded === undefined)
    .map((entry) => ({ sound: entry.sound, score: entry.result.score, reasons: entry.result.reasons }))
    .sort((a, b) => b.score - a.score || a.sound.id - b.sound.id)
    .slice(0, limit);
}

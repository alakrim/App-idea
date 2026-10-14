import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ALARM_FRAME_PROBABILITY,
  chooseCandidate,
  DENY_FRAME_PROBABILITY,
  denyLabelsFor,
  denyThresholdOf,
  familiesFor,
  parseAudiosetNames,
  policyFor,
  REQUIRED_FRACTION,
  screenCandidate,
  WINDOW_FRAMES,
} from './screen-policy.mjs';

/** A label set with one denied sound, one required sound and one neutral sound. */
const LABELS = ['Rain', 'Siren', 'Civil defense siren', 'Speech'];
const RAIN = 0;
const SIREN = 1;

/** Tag rows for `frames` seconds: rain everywhere unless a row overrides a column. */
function tagsWith(frames, overrides = {}) {
  const perFrame = Array.from({ length: frames }, (_, f) => [0.9, 0, 0, 0].map((v, c) => overrides[`${f}:${c}`] ?? v));
  return { frameSeconds: 1, frames, labels: LABELS, perFrame, topClasses: [{ label: 'Rain', max: 0.9 }] };
}

const LEVELS = (frames) => Array.from({ length: frames }, () => -30);
const RAIN_POLICY = { deny: ['Siren', 'Civil defense siren'], required: [['Rain']], clap: 'rain' };

describe('parseAudiosetNames', () => {
  it('reads display names from the label CSV, including quoted names with commas', () => {
    const csv = 'index,mid,display_name\n0,/m/09x0r,"Speech"\n1,/m/x,"Gull, seagull"\n2,/m/y,Rain\n';
    assert.deepEqual(parseAudiosetNames(csv), ['Speech', 'Gull, seagull', 'Rain']);
  });
});

describe('deny families', () => {
  const NAMES = ['Siren', 'Civil defense siren', 'Police car (siren)', 'Speech', 'Bird vocalization, bird call, bird song', 'Engine', 'Rain', 'Thunder', 'Drum', 'Air conditioning'];
  const base = { allowsVoices: false, screen: { exempt: [], required: [], clap: '' } };

  it('denies every child of a family, not only the parent class', () => {
    const deny = denyLabelsFor(base, NAMES);
    assert.ok(deny.includes('Civil defense siren'));
    assert.ok(deny.includes('Police car (siren)'));
    assert.ok(deny.includes('Speech'));
    assert.ok(deny.includes('Engine'));
    assert.ok(deny.includes('Thunder'));
  });

  it('never denies birds, rain or the air handling of an office', () => {
    const deny = denyLabelsFor(base, NAMES);
    assert.ok(!deny.includes('Bird vocalization, bird call, bird song'));
    assert.ok(!deny.includes('Rain'));
    assert.ok(!deny.includes('Air conditioning'));
  });

  it('lifts voices for a voice category, and only that', () => {
    const voices = { ...base, allowsVoices: true };
    const deny = denyLabelsFor(voices, NAMES);
    assert.ok(!deny.includes('Speech'));
    assert.ok(deny.includes('Siren'));
  });

  it('lifts a family or a single label when a target exempts it', () => {
    const exempt = { ...base, screen: { exempt: ['engines', 'Drum'], required: [], clap: '' } };
    const deny = denyLabelsFor(exempt, NAMES);
    assert.ok(!deny.includes('Engine'));
    assert.ok(!deny.includes('Drum'));
    assert.ok(deny.includes('Siren'));
    assert.ok(familiesFor(exempt).includes('alarms'));
    assert.ok(!familiesFor(exempt).includes('engines'));
  });

  it('denies a siren at the lower alarm-family threshold, and other classes at the general one', () => {
    const near = { tags: { labels: ['Civil defense siren', 'Engine'], frames: 1, perFrame: [[0.1, 0.1]], topClasses: [] }, levelsDb: [-30], policy: { deny: ['Civil defense siren', 'Engine'], required: [], clap: '' } };
    const r = screenCandidate(near);
    assert.deepEqual(r.evidence.deniedMax.map((d) => d.label), ['Civil defense siren']);
    assert.equal(denyThresholdOf('Civil defense siren'), ALARM_FRAME_PROBABILITY);
    assert.equal(denyThresholdOf('Engine'), DENY_FRAME_PROBABILITY);
  });

  it('refuses a required name that is not an AudioSet label', () => {
    const target = { id: 'x', ...base, screen: { exempt: [], required: [['Gull']], clap: '' } };
    assert.throws(() => policyFor(target, NAMES), /"Gull" is not an AudioSet label/);
  });
});

describe('screenCandidate', () => {
  it('passes a clean clip and picks the steadiest window', () => {
    const levels = Array.from({ length: 80 }, (_, s) => (s % 2 === 0 ? -30 : -36));
    const result = screenCandidate({ tags: tagsWith(80), levelsDb: levels, policy: RAIN_POLICY });
    assert.equal(result.verdict, 'pass');
    assert.equal(result.window.lengthSeconds, WINDOW_FRAMES);
    assert.equal(typeof result.window.startSeconds, 'number');
  });

  it('rejects a clip whose only window contains a siren frame, and names the denied class', () => {
    const tags = tagsWith(WINDOW_FRAMES, { [`10:${SIREN}`]: 0.6 });
    const result = screenCandidate({ tags, levelsDb: LEVELS(WINDOW_FRAMES), policy: RAIN_POLICY });
    assert.equal(result.verdict, 'reject');
    assert.match(result.reason, /Siren reaches 0.6 \(at 10 s\)/);
    assert.equal(result.window, null);
  });

  it('skips a contaminated stretch and keeps a clean window elsewhere', () => {
    const frames = WINDOW_FRAMES + 20;
    const tags = tagsWith(frames, { [`5:${SIREN}`]: 0.5 });
    const result = screenCandidate({ tags, levelsDb: LEVELS(frames), policy: RAIN_POLICY });
    assert.equal(result.verdict, 'pass');
    assert.ok(result.window.startSeconds > 5, 'the window starts after the siren second');
  });

  it('rejects a general deny class at exactly the frame threshold, and passes just under it', () => {
    const SPEECH = 3;
    const policy = { deny: ['Speech'], required: [['Rain']], clap: 'rain' };
    const at = tagsWith(WINDOW_FRAMES, { [`3:${SPEECH}`]: DENY_FRAME_PROBABILITY });
    assert.equal(screenCandidate({ tags: at, levelsDb: LEVELS(WINDOW_FRAMES), policy }).verdict, 'reject');
    const under = tagsWith(WINDOW_FRAMES, { [`3:${SPEECH}`]: 0.149 });
    assert.equal(screenCandidate({ tags: under, levelsDb: LEVELS(WINDOW_FRAMES), policy }).verdict, 'pass');
  });

  it('rejects when a required sound is absent from most of the clip', () => {
    const frames = WINDOW_FRAMES;
    const tags = tagsWith(frames);
    // Rain in only 20 of 64 seconds: below the required share.
    for (let f = 0; f < frames; f++) tags.perFrame[f][RAIN] = f >= frames - 20 ? 0.9 : 0;
    assert.ok(20 / frames < REQUIRED_FRACTION);
    const result = screenCandidate({ tags, levelsDb: LEVELS(frames), policy: RAIN_POLICY });
    assert.equal(result.verdict, 'reject');
    assert.match(result.reason, /required sound absent: Rain/);
  });

  it('rejects a clip shorter than one window', () => {
    const result = screenCandidate({
      tags: tagsWith(WINDOW_FRAMES - 1),
      levelsDb: LEVELS(WINDOW_FRAMES - 1),
      policy: RAIN_POLICY,
    });
    assert.equal(result.verdict, 'reject');
    assert.match(result.reason, /a window needs/);
  });
});

describe('chooseCandidate', () => {
  it('takes the highest CLAP score among passing candidates', () => {
    const chosen = chooseCandidate([
      { verdict: 'pass', rank: 1, clapScore: 0.2, freesoundId: 1 },
      { verdict: 'pass', rank: 2, clapScore: 0.4, freesoundId: 2 },
      { verdict: 'reject', rank: 3, clapScore: 0.9, freesoundId: 3 },
    ]);
    assert.equal(chosen?.freesoundId, 2);
  });

  it('falls back to curation order when no CLAP score is known', () => {
    const chosen = chooseCandidate([
      { verdict: 'pass', rank: 2, clapScore: null, freesoundId: 2 },
      { verdict: 'pass', rank: 1, clapScore: null, freesoundId: 1 },
    ]);
    assert.equal(chosen?.freesoundId, 1);
  });

  it('returns null when nothing passed', () => {
    assert.equal(chooseCandidate([{ verdict: 'reject', rank: 1, clapScore: 0.5 }]), null);
  });
});

import {
  createAmbienceMixer,
  type AmbienceMixer,
  type MixerContext,
  type MixerGain,
  type MixerParam,
} from '@/audio/ambience-mixer';
import type { InstalledBed } from '@/audio/ambience-pack';

import type { JsonValue, ProbeOutcome } from './probe';

/** How long the ducking check lets the bed play before and after the duck. */
export const DUCK_SETTLE_MS = 1000;
export const DUCK_HOLD_MS = 1500;
/** The bed the playback check uses. The base pack is always installed. */
export const PLAYBACK_BED = 'base_rain';

export interface AudioDeps {
  /** A fresh audio context, the same kind the player's mixer uses. */
  createContext(): MixerContext;
  /** The bundled base-pack beds, with their manifest entries. */
  beds: readonly InstalledBed[];
  sleep(ms: number): Promise<void>;
}

/** Decodes each bed and reports its decoded length and its manifest loop region. */
export async function checkBedDecode(deps: AudioDeps): Promise<ProbeOutcome> {
  const context = deps.createContext();
  const beds: Record<string, JsonValue> = {};
  const failures: string[] = [];
  for (const bed of deps.beds) {
    const decoded = await context.decodeAudioData(bed.asset);
    const manifestSeconds = bed.meta.durationMs / 1000;
    const ok = decoded.duration > 0 && Math.abs(decoded.duration - manifestSeconds) < 0.05;
    if (!ok) failures.push(bed.id);
    beds[bed.id] = {
      decodedSeconds: round(decoded.duration),
      manifestSeconds: round(manifestSeconds),
      loopStartMs: bed.meta.loopStartMs,
      loopEndMs: bed.meta.loopEndMs,
    };
  }
  return {
    status: failures.length === 0 && deps.beds.length > 0 ? 'pass' : 'fail',
    values: { beds },
    message:
      deps.beds.length === 0
        ? 'No base-pack beds are installed.'
        : failures.length === 0
          ? undefined
          : `Decoded length differs from the manifest for ${failures.join(', ')}.`,
  };
}

/** One scheduled change to a gain, with its times in milliseconds from the start of the check. */
export interface ScheduledRamp {
  node: string;
  targetDb: number;
  startMs: number;
  endMs: number;
}

/**
 * Plays one bed through the real mixer, ducks it, and records every ramp the mixer schedules on
 * the audio clock. The voice is not played: this measures the mixer's own schedule, not the voice.
 */
export async function checkDuckingRamps(deps: AudioDeps): Promise<ProbeOutcome> {
  const ramps: ScheduledRamp[] = [];
  const context = deps.createContext();
  const started = { clock: context.currentTime };
  const recording = recordingContext(context, ramps, started);
  const mixer: AmbienceMixer = createAmbienceMixer({
    resolveBed: (category) => {
      const bed = deps.beds.find((entry) => entry.id === category);
      return bed
        ? {
            id: bed.id,
            asset: bed.asset,
            lufs: bed.meta.lufs,
            loopStartMs: bed.meta.loopStartMs,
            loopEndMs: bed.meta.loopEndMs,
          }
        : null;
    },
    createContext: () => recording,
  });

  try {
    mixer.apply([
      { type: 'start', cueId: 'probe', category: PLAYBACK_BED, gainDb: -24, fadeMs: 300 },
    ]);
    await deps.sleep(DUCK_SETTLE_MS);
    mixer.setDucking({ gainDb: -12, rampMs: 300 });
    await deps.sleep(DUCK_HOLD_MS);
  } finally {
    mixer.dispose();
  }

  const duck = ramps.find((ramp) => ramp.node === 'ducking');
  const bedFade = ramps.find((ramp) => ramp.node === 'bed');
  const duckLengthMs = duck ? round(duck.endMs - duck.startMs) : null;
  const ok = duck !== undefined && duckLengthMs !== null && Math.abs(duckLengthMs - 300) <= 50;
  return {
    status: ok ? 'pass' : 'fail',
    values: {
      duckStartMs: duck ? round(duck.startMs) : null,
      duckLengthMs,
      duckTargetDb: duck?.targetDb ?? null,
      bedFadeInLengthMs: bedFade ? round(bedFade.endMs - bedFade.startMs) : null,
      rampCount: ramps.length,
    },
    message: ok ? undefined : 'The ducking ramp was not scheduled as 300 ms.',
  };
}

/** Lock-screen transport needs the native media session, which this build does not expose yet. */
export function checkLockScreenSession(hasSession: boolean | null): ProbeOutcome {
  if (hasSession === null) {
    return {
      status: 'skipped',
      values: { active: null },
      message: 'Not exposed by expo-audio 57 or react-native-audio-api 0.13. Part of S1.',
    };
  }
  return {
    status: hasSession ? 'pass' : 'fail',
    values: { active: hasSession },
    message: hasSession ? undefined : 'No lock-screen session is active.',
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Wraps a context so each gain ramp the mixer schedules is recorded. The mixer's own calls are
 * forwarded unchanged. Gain nodes are named by the order the mixer creates them: master first, then
 * ducking, then one per bed.
 */
function recordingContext(
  inner: MixerContext,
  ramps: ScheduledRamp[],
  started: { clock: number },
): MixerContext {
  let created = 0;
  const nodeNames = ['master', 'ducking'];
  const toMs = (clock: number) => (clock - started.clock) * 1000;
  return {
    get currentTime() {
      return inner.currentTime;
    },
    get destination() {
      return inner.destination;
    },
    decodeAudioData: (asset) => inner.decodeAudioData(asset),
    createBufferSource: () => inner.createBufferSource(),
    createGain: () => {
      const node = inner.createGain();
      const name = nodeNames[created] ?? 'bed';
      created += 1;
      return new Proxy(node, {
        get(target, property) {
          if (property !== 'gain') return bindIfFunction(target, property);
          return recordParam(target.gain, name, inner, ramps, toMs);
        },
      }) as MixerGain;
    },
    close: () => inner.close(),
  };
}

/**
 * Records a param's linear ramps. A ramp starts at the last `setValueAtTime` anchor on the same
 * param, which is how the mixer schedules every fade, or at the current clock when there is none.
 */
function recordParam(
  param: MixerParam,
  node: string,
  inner: MixerContext,
  ramps: ScheduledRamp[],
  toMs: (clock: number) => number,
): MixerParam {
  let anchor: number | null = null;
  return new Proxy(param, {
    get(target, property) {
      if (property === 'setValueAtTime') {
        return (value: number, time: number) => {
          anchor = time;
          return target.setValueAtTime(value, time);
        };
      }
      if (property === 'linearRampToValueAtTime') {
        return (value: number, endTime: number) => {
          ramps.push({
            node,
            targetDb: round(linearToDb(value)),
            startMs: toMs(anchor ?? inner.currentTime),
            endMs: toMs(endTime),
          });
          return target.linearRampToValueAtTime(value, endTime);
        };
      }
      return bindIfFunction(target, property);
    },
  });
}

function linearToDb(value: number): number {
  return value <= 0 ? -Infinity : 20 * Math.log10(value);
}

function bindIfFunction(target: object, property: string | symbol): unknown {
  const value: unknown = Reflect.get(target, property);
  return typeof value === 'function'
    ? (value as (...args: unknown[]) => unknown).bind(target)
    : value;
}

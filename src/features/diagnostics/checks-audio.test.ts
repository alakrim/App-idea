import type {
  MixerBuffer,
  MixerBufferSource,
  MixerContext,
  MixerGain,
  MixerNode,
  MixerParam,
} from '@/audio/ambience-mixer';
import type { InstalledBed } from '@/audio/ambience-pack';

import { checkBedDecode, checkDuckingRamps, checkLockScreenSession, PLAYBACK_BED } from './checks-audio';

const NODE: MixerNode = { connect: () => undefined, disconnect: () => undefined };

/** A gain parameter that keeps the scheduled calls, so the test can read them back. */
function recordingParam(calls: { method: string; args: number[] }[]): MixerParam {
  return {
    value: 1,
    cancelScheduledValues: (time) => calls.push({ method: 'cancel', args: [time] }),
    setValueAtTime: (value, time) => calls.push({ method: 'set', args: [value, time] }),
    linearRampToValueAtTime: (value, time) => calls.push({ method: 'ramp', args: [value, time] }),
  };
}

/**
 * A context on a fake clock. The clock moves only when the test sets it, so the recorded times are
 * exact. Each decode returns the duration given for its asset.
 */
function fakeContext(durations: Record<number, number>) {
  const clock = { now: 10 };
  const ramps: { method: string; args: number[] }[] = [];
  const gains: MixerGain[] = [];
  const context: MixerContext = {
    get currentTime() {
      return clock.now;
    },
    destination: NODE,
    decodeAudioData: async (asset: number): Promise<MixerBuffer> => ({ duration: durations[asset] ?? 0 }),
    createBufferSource: (): MixerBufferSource => ({
      buffer: null,
      loop: false,
      loopStart: 0,
      loopEnd: 0,
      start: () => undefined,
      stop: () => undefined,
      connect: () => undefined,
      disconnect: () => undefined,
    }),
    createGain: (): MixerGain => {
      const gain: MixerGain = {
        gain: recordingParam(ramps),
        connect: () => undefined,
        disconnect: () => undefined,
      };
      gains.push(gain);
      return gain;
    },
    close: async () => undefined,
  };
  return { context, clock, ramps, gains };
}

const BEDS: InstalledBed[] = [
  {
    id: 'base_rain',
    asset: 1,
    meta: {
      id: 'base_rain',
      file: 'base_rain.m4a',
      durationMs: 4000,
      loopStartMs: 500,
      loopEndMs: 3500,
      lufs: -23,
      bytes: 1000,
      sha256: 'a'.repeat(64),
      kind: 'bed',
      source: 'procedural',
      recipeVersion: '1',
    },
  } as unknown as InstalledBed,
];

const sleep = async () => undefined;

describe('bed decode probe', () => {
  it('passes when each bed decodes to its manifest length, and reports the loop region', async () => {
    const { context } = fakeContext({ 1: 4 });

    const outcome = await checkBedDecode({ createContext: () => context, beds: BEDS, sleep });

    expect(outcome.status).toBe('pass');
    expect(outcome.values).toEqual({
      beds: {
        base_rain: { decodedSeconds: 4, manifestSeconds: 4, loopStartMs: 500, loopEndMs: 3500 },
      },
    });
  });

  it('fails a bed whose decoded length is not the manifest length', async () => {
    const { context } = fakeContext({ 1: 2.5 });

    const outcome = await checkBedDecode({ createContext: () => context, beds: BEDS, sleep });

    expect(outcome).toMatchObject({
      status: 'fail',
      message: 'Decoded length differs from the manifest for base_rain.',
    });
  });

  it('fails when no bed is installed', async () => {
    const { context } = fakeContext({});
    expect(await checkBedDecode({ createContext: () => context, beds: [], sleep })).toMatchObject({
      status: 'fail',
      message: 'No base-pack beds are installed.',
    });
  });
});

describe('ducking ramp probe', () => {
  it('plays the sample bed, ducks it, and reports the ducking ramp the mixer schedules', async () => {
    const { context, clock, ramps } = fakeContext({ 1: 4 });
    // The sleeps advance the fake clock, as real time would advance the audio clock.
    const advance = async (ms: number) => {
      clock.now += ms / 1000;
    };

    const outcome = await checkDuckingRamps({
      createContext: () => context,
      beds: BEDS,
      sleep: advance,
    });

    expect(PLAYBACK_BED).toBe('base_rain');
    expect(ramps.length).toBeGreaterThan(0);
    expect(outcome.status).toBe('pass');
    expect(outcome.values).toMatchObject({ duckLengthMs: 300, duckTargetDb: -12 });
  });

  it('fails when the sample bed is not installed, because there is then nothing to duck', async () => {
    const { context } = fakeContext({});
    const outcome = await checkDuckingRamps({ createContext: () => context, beds: [], sleep });
    expect(outcome).toMatchObject({
      status: 'fail',
      message: 'The sample bed did not start, so there was nothing to duck.',
    });
  });
});

describe('lock-screen probe', () => {
  it('is skipped while no session status is exposed', () => {
    expect(checkLockScreenSession(null)).toMatchObject({ status: 'skipped' });
  });

  it('passes with an active session and fails without one', () => {
    expect(checkLockScreenSession(true).status).toBe('pass');
    expect(checkLockScreenSession(false)).toMatchObject({
      status: 'fail',
      message: 'No lock-screen session is active.',
    });
  });
});

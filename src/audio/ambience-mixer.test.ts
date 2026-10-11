import {
  type MixerBuffer,
  type MixerBufferSource,
  type MixerContext,
  type MixerGain,
  type MixerNode,
  type MixerParam,
  type ResolvedBed,
  createAmbienceMixer,
} from './ambience-mixer';

interface Ramp {
  value: number;
  at: number;
}

class FakeParam implements MixerParam {
  value = 1;
  readonly ramps: Ramp[] = [];
  readonly cancels: number[] = [];
  cancelScheduledValues(cancelTime: number): void {
    this.cancels.push(cancelTime);
  }
  setValueAtTime(value: number, startTime: number): void {
    this.value = value;
    this.ramps.push({ value, at: startTime });
  }
  linearRampToValueAtTime(value: number, endTime: number): void {
    this.ramps.push({ value, at: endTime });
  }
}

class FakeNode implements MixerNode {
  readonly outputs: FakeNode[] = [];
  disconnected = false;
  connect(destination: MixerNode): void {
    this.outputs.push(destination as FakeNode);
  }
  disconnect(): void {
    this.disconnected = true;
    this.outputs.length = 0;
  }
}

class FakeGain extends FakeNode implements MixerGain {
  readonly gain = new FakeParam();
}

class FakeSource extends FakeNode implements MixerBufferSource {
  buffer: MixerBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  startedAt: number | null = null;
  stopCalls: (number | undefined)[] = [];
  start(when?: number): void {
    this.startedAt = when ?? 0;
  }
  stop(when?: number): void {
    this.stopCalls.push(when);
  }
}

function createFakeContext() {
  let currentTime = 0;
  const decodes: {
    asset: number;
    resolve: (b: MixerBuffer) => void;
    reject: (e: unknown) => void;
  }[] = [];
  const sources: FakeSource[] = [];
  const gains: FakeGain[] = [];
  const destination = new FakeNode();
  const context = {
    get currentTime() {
      return currentTime;
    },
    destination,
    decodeAudioData: jest.fn(
      (asset: number) =>
        new Promise<MixerBuffer>((resolve, reject) => {
          decodes.push({ asset, resolve, reject });
        }),
    ),
    createBufferSource(): MixerBufferSource {
      const source = new FakeSource();
      sources.push(source);
      return source;
    },
    createGain(): MixerGain {
      const gain = new FakeGain();
      gains.push(gain);
      return gain;
    },
    close: jest.fn(() => Promise.resolve()),
  } satisfies MixerContext;
  return {
    context,
    decodes,
    sources,
    gains,
    destination,
    setTime(t: number) {
      currentTime = t;
    },
  };
}

const BEDS: Record<string, ResolvedBed> = {
  light_rain: { id: 'base_rain', asset: 101, lufs: -28 },
  forest_night: { id: 'base_wind', asset: 102, lufs: -28 },
  city_night: { id: 'base_crowd', asset: 103, lufs: -28 },
};

/**
 * Gains are created in this order: master, ducking, then one per bed. Bed gains are the rest.
 */
const bedGains = (gains: readonly FakeGain[]) => gains.slice(2);

/** Lets pending decode promises settle, so the start callbacks run. */
const flush = () => new Promise((resolve) => setImmediate(resolve));

function setup(options: { cacheSize?: number; onError?: (e: unknown) => void } = {}) {
  const fake = createFakeContext();
  const createContext = jest.fn(() => fake.context);
  const resolveBed = jest.fn((category: string) => BEDS[category] ?? null);
  const mixer = createAmbienceMixer({ resolveBed, createContext, ...options });
  return { ...fake, mixer, createContext, resolveBed };
}

const start = (cueId: string, category: string, gainDb = -22, fadeMs = 2500) =>
  ({ type: 'start', cueId, category, gainDb, fadeMs }) as const;

describe('ambience mixer: lazy setup', () => {
  it('does not create an audio context until something is played', () => {
    const { createContext, mixer } = setup();
    mixer.setMaster(true);
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it('wires bed, then bed gain, then master, then ducking, then destination', async () => {
    const { mixer, decodes, sources, gains, destination } = setup();
    mixer.apply([start('c1', 'light_rain')]);
    decodes[0]?.resolve({ duration: 60 });
    await flush();
    const [source] = sources;
    const [master, ducking] = gains;
    const [bedGain] = bedGains(gains);
    expect(source?.outputs).toEqual([bedGain]);
    expect(bedGain?.outputs).toEqual([master]);
    expect(master?.outputs).toEqual([ducking]);
    expect(ducking?.outputs).toEqual([destination]);
  });
});

describe('ambience mixer: starting and stopping', () => {
  it('decodes the resolved bed and starts it looping over its full length, with a fade-in', async () => {
    const { mixer, decodes, sources, gains, resolveBed } = setup();
    mixer.apply([start('c1', 'light_rain', -22, 2500)]);
    expect(resolveBed).toHaveBeenCalledWith('light_rain');
    expect(decodes[0]?.asset).toBe(101);
    decodes[0]?.resolve({ duration: 60 });
    await flush();
    const [source] = sources;
    expect(source).toMatchObject({ loop: true, loopStart: 0, loopEnd: 60, startedAt: 0 });
    const bedGain = bedGains(gains)[0];
    expect(bedGain?.gain.ramps[0]).toEqual({ value: 0, at: 0 });
    expect(bedGain?.gain.ramps[1]?.at).toBeCloseTo(2.5, 10);
    expect(bedGain?.gain.ramps[1]?.value).toBeCloseTo(10 ** (-22 / 20), 10);
  });

  it('skips a category with no installed bed without decoding anything', () => {
    const { mixer, decodes, sources } = setup();
    mixer.apply([start('c1', 'horse_gallop')]);
    expect(decodes).toHaveLength(0);
    expect(sources).toHaveLength(0);
  });

  it('never starts a bed that was stopped while it was still decoding', async () => {
    const { mixer, decodes, sources } = setup();
    mixer.apply([start('c1', 'light_rain')]);
    mixer.apply([{ type: 'stop', cueId: 'c1', fadeMs: 3000 }]);
    decodes[0]?.resolve({ duration: 60 });
    await flush();
    expect(sources).toHaveLength(0);
  });

  it('fades a stopped bed out on the audio clock and stops its source at the end of the fade', async () => {
    const { mixer, decodes, sources, gains, setTime } = setup();
    mixer.apply([start('c1', 'light_rain')]);
    decodes[0]?.resolve({ duration: 60 });
    await flush();
    setTime(10);
    mixer.apply([{ type: 'stop', cueId: 'c1', fadeMs: 3000 }]);
    const [source] = sources;
    const bedGain = bedGains(gains)[0];
    expect(source?.stopCalls).toEqual([expect.closeTo(13, 10)]);
    expect(bedGain?.gain.ramps.at(-1)).toEqual({ value: 0, at: 13 });
  });

  it('does not start a second copy of a bed that is already sounding', async () => {
    const { mixer, decodes, sources } = setup();
    mixer.apply([start('c1', 'light_rain')]);
    decodes[0]?.resolve({ duration: 60 });
    await flush();
    mixer.apply([start('c1', 'light_rain')]);
    expect(decodes).toHaveLength(1);
    expect(sources).toHaveLength(1);
  });
});

describe('ambience mixer: retargeting', () => {
  it('ramps a sounding bed to its new gain', async () => {
    const { mixer, decodes, gains, setTime } = setup();
    mixer.apply([start('c1', 'light_rain')]);
    decodes[0]?.resolve({ duration: 60 });
    await flush();
    setTime(5);
    mixer.apply([{ type: 'retarget', cueId: 'c1', gainDb: -18, rampMs: 400 }]);
    const bedGain = bedGains(gains)[0];
    expect(bedGain?.gain.ramps.at(-1)?.value).toBeCloseTo(10 ** (-18 / 20), 10);
    expect(bedGain?.gain.ramps.at(-1)?.at).toBeCloseTo(5.4, 10);
  });

  it('applies a retarget that arrives during decoding when the bed starts', async () => {
    const { mixer, decodes, gains } = setup();
    mixer.apply([start('c1', 'light_rain', -22)]);
    mixer.apply([{ type: 'retarget', cueId: 'c1', gainDb: -16, rampMs: 400 }]);
    decodes[0]?.resolve({ duration: 60 });
    await flush();
    expect(bedGains(gains)[0]?.gain.ramps.at(-1)?.value).toBeCloseTo(10 ** (-16 / 20), 10);
  });
});

describe('ambience mixer: buffer cache', () => {
  it('decodes a bed once and reuses it for later starts', async () => {
    const { mixer, decodes, context } = setup();
    mixer.apply([start('c1', 'light_rain')]);
    decodes[0]?.resolve({ duration: 60 });
    await flush();
    mixer.apply([{ type: 'stop', cueId: 'c1', fadeMs: 0 }]);
    mixer.apply([start('c2', 'light_rain')]);
    await flush();
    expect(context.decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it('evicts the least recently used buffer beyond the cache size', async () => {
    const { mixer, decodes, context } = setup({ cacheSize: 2 });
    const categories = ['light_rain', 'forest_night', 'city_night'];
    categories.forEach((category, i) => mixer.apply([start(`c${i}`, category)]));
    decodes.forEach((d) => d.resolve({ duration: 60 }));
    await flush();
    expect(context.decodeAudioData).toHaveBeenCalledTimes(3);

    mixer.apply([start('again', 'light_rain')]);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(4);
  });
});

describe('ambience mixer: failures and cleanup', () => {
  it('reports a failed decode, drops it, and tries again on the next start', async () => {
    const onError = jest.fn();
    const { mixer, decodes, context } = setup({ onError });
    mixer.apply([start('c1', 'light_rain')]);
    decodes[0]?.reject(new Error('corrupt asset'));
    await flush();
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'corrupt asset' }));

    mixer.apply([start('c1', 'light_rain')]);
    expect(context.decodeAudioData).toHaveBeenCalledTimes(2);
  });

  it('disconnects the nodes of a stopped bed once its fade has finished', async () => {
    const { mixer, decodes, sources, gains, setTime } = setup();
    mixer.apply([start('c1', 'light_rain')]);
    decodes[0]?.resolve({ duration: 60 });
    await flush();
    setTime(1);
    mixer.apply([{ type: 'stop', cueId: 'c1', fadeMs: 3000 }]);
    setTime(4.5);
    mixer.apply([]);
    expect(sources[0]?.disconnected).toBe(true);
    expect(bedGains(gains)[0]?.disconnected).toBe(true);
  });

  it('sets the master gain with a ramp, and the ducking stage from a ramp request', () => {
    const { mixer, gains } = setup();
    mixer.setMaster(false);
    mixer.setDucking({ gainDb: -7, rampMs: 30 });
    const [master, ducking] = gains;
    expect(master?.gain.ramps.at(-1)?.value).toBe(0);
    expect(ducking?.gain.ramps.at(-1)?.value).toBeCloseTo(10 ** (-7 / 20), 10);
    expect(ducking?.gain.ramps.at(-1)?.at).toBeCloseTo(0.03, 10);
  });

  it('dispose stops every sounding bed, closes the context, and ignores later calls', async () => {
    const { mixer, decodes, sources, context, createContext } = setup();
    mixer.apply([start('c1', 'light_rain')]);
    decodes[0]?.resolve({ duration: 60 });
    await flush();
    mixer.dispose();
    expect(sources[0]?.stopCalls).toEqual([undefined]);
    expect(context.close).toHaveBeenCalledTimes(1);
    mixer.apply([start('c2', 'light_rain')]);
    mixer.setMaster(true);
    expect(createContext).toHaveBeenCalledTimes(1);
  });
});

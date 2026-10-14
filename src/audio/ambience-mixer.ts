import type { BedCommand } from '@/core/playback/ambience-scheduler';
import { type DuckRamp, dbToLinear } from '@/core/playback/ducking';

/** Master gain changes (ambience toggles, sleep fades) ramp over this long, so they never click. */
const MASTER_RAMP_MS = 300;
/** Decoded beds kept in memory. A 60 s mono bed at 48 kHz is about 11.5 MB, so this holds four. */
export const DEFAULT_CACHE_BUDGET_BYTES = 48 * 1024 * 1024;
const DEFAULT_SAMPLE_RATE = 48_000;
const BYTES_PER_SAMPLE = 4;

/**
 * A bundled bed the category resolved to. `asset` is the `require()` id that decodes it. `lufs` is
 * the bed's integrated loudness from the manifest, which the planner uses to level it.
 */
export interface ResolvedBed {
  id: string;
  asset: number;
  lufs: number;
  /**
   * Loop region in ms, from the manifest. Files carry codec "roll" audio outside it so the AAC seam
   * is clean; only [loopStartMs, loopEndMs) may ever loop (assets/ambience/README.md).
   */
  loopStartMs: number;
  loopEndMs: number;
}

export type ResolveBed = (categoryId: string) => ResolvedBed | null;

/*
 * The subset of react-native-audio-api 0.13 used here. Each interface is structurally satisfied by
 * the library's AudioContext, AudioBufferSourceNode, GainNode and AudioParam, which keeps this
 * module importable and testable in Node without the native module.
 */
export interface MixerBuffer {
  readonly duration: number;
  /** Optional so that minimal test doubles stay valid. Real decoded buffers always carry them. */
  readonly sampleRate?: number;
  readonly numberOfChannels?: number;
}

export interface MixerParam {
  value: number;
  cancelScheduledValues(cancelTime: number): unknown;
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
}

export interface MixerNode {
  connect(destination: MixerNode): unknown;
  disconnect(): void;
}

export interface MixerGain extends MixerNode {
  readonly gain: MixerParam;
}

export interface MixerBufferSource extends MixerNode {
  buffer: MixerBuffer | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  start(when?: number, offset?: number): void;
  stop(when?: number): void;
}

export interface MixerContext {
  readonly currentTime: number;
  readonly destination: MixerNode;
  decodeAudioData(asset: number): Promise<MixerBuffer>;
  createBufferSource(): MixerBufferSource;
  createGain(): MixerGain;
  close(): Promise<void>;
  /** Pauses the audio clock while nothing sounds. Optional: test doubles may omit it. */
  suspend?(): Promise<void>;
  /** Restarts the audio clock after a suspend. Optional, as for `suspend`. */
  resume?(): Promise<void>;
}

export interface AmbienceMixer {
  /** Applies planner commands. Unknown categories are skipped without an error. */
  apply(commands: readonly BedCommand[]): void;
  /** The ambience bus gain, from 0 (silent) to 1. Sleep fades drive it, so beds fade with the voice. */
  setMasterGain(gain: number): void;
  /** Ramps the ducking stage that sits between the master bus and the output. */
  setDucking(ramp: DuckRamp): void;
  /**
   * Suspends the audio clock, as long as no bed is sounding or decoding. The next start resumes
   * it, so an idle player holds no audio stream.
   */
  suspend(): void;
  dispose(): void;
}

export interface AmbienceMixerOptions {
  resolveBed: ResolveBed;
  /** Creates the audio context on first use, so nothing touches native audio until needed. */
  createContext: () => MixerContext;
  /** Bytes of decoded buffers kept in memory. The default is 48 MB. */
  cacheBudgetBytes?: number;
  onError?: (error: unknown) => void;
}

interface Graph {
  master: MixerGain;
  ducking: MixerGain;
}

interface SoundingBed {
  source: MixerBufferSource;
  gain: MixerGain;
}

interface PendingBed {
  token: symbol;
  gainDb: number;
  fadeMs: number;
}

interface RetiredBed extends SoundingBed {
  endAt: number;
}

interface CacheEntry {
  decoding: Promise<MixerBuffer>;
  /** Zero until the decode finishes, so a decode in flight is never evicted for its size. */
  bytes: number;
}

/** Schedules a linear ramp from the param's current value. Cancelling first keeps it predictable. */
function rampTo(param: MixerParam, value: number, rampMs: number, now: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + rampMs / 1000);
}

/** Memory a decoded buffer holds: samples times channels, at 32-bit float. */
export function decodedBytes(buffer: MixerBuffer): number {
  const rate = buffer.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const channels = buffer.numberOfChannels ?? 1;
  return Math.ceil(buffer.duration * rate) * channels * BYTES_PER_SAMPLE;
}

/**
 * Plays ambience beds on one AudioContext: each bed is a looping buffer source into its own gain,
 * then into the master gain and the ducking gain. Every fade is scheduled on the audio clock, so
 * a stop can never leave an orphan source running. The context is created by the first bed, not
 * by a gain change. Decoded buffers live in an LRU cache bounded by their bytes.
 */
export function createAmbienceMixer(options: AmbienceMixerOptions): AmbienceMixer {
  const budgetBytes = options.cacheBudgetBytes ?? DEFAULT_CACHE_BUDGET_BYTES;
  let context: MixerContext | null = null;
  let graph: Graph | null = null;
  let disposed = false;
  let suspended = false;
  /** Gain changes made before the context exists. They are applied when it is created. */
  let masterGain = 1;
  let ducking: DuckRamp = { gainDb: 0, rampMs: 0 };
  const sounding = new Map<string, SoundingBed>();
  const pending = new Map<string, PendingBed>();
  const retired: RetiredBed[] = [];
  /** Insertion order is the LRU order: the first entry is the least recently used. */
  const buffers = new Map<string, CacheEntry>();

  function ensureGraph(): { context: MixerContext; graph: Graph } {
    if (!context || !graph) {
      const created = options.createContext();
      const master = created.createGain();
      const ducker = created.createGain();
      master.gain.value = masterGain;
      ducker.gain.value = dbToLinear(ducking.gainDb);
      master.connect(ducker);
      ducker.connect(created.destination);
      context = created;
      graph = { master, ducking: ducker };
    }
    return { context, graph };
  }

  /** Disconnects nodes whose fade-out has finished, so long chapters do not accumulate nodes. */
  function sweepRetired(now: number): void {
    for (let i = retired.length - 1; i >= 0; i -= 1) {
      const bed = retired[i];
      if (bed && bed.endAt <= now) {
        bed.source.disconnect();
        bed.gain.disconnect();
        retired.splice(i, 1);
      }
    }
  }

  function resumeIfSuspended(ctx: MixerContext): void {
    if (!suspended) return;
    suspended = false;
    ctx.resume?.().catch((error: unknown) => options.onError?.(error));
  }

  /** Drops least recently used buffers until the decoded ones fit the budget. */
  function evictToBudget(keepId: string): void {
    let total = 0;
    for (const entry of buffers.values()) total += entry.bytes;
    for (const [id, entry] of buffers) {
      if (total <= budgetBytes) break;
      if (id === keepId) continue;
      buffers.delete(id);
      total -= entry.bytes;
    }
  }

  function loadBuffer(bed: ResolvedBed, decodeContext: MixerContext): Promise<MixerBuffer> {
    const cached = buffers.get(bed.id);
    if (cached) {
      buffers.delete(bed.id);
      buffers.set(bed.id, cached);
      return cached.decoding;
    }
    const entry: CacheEntry = { decoding: decodeContext.decodeAudioData(bed.asset), bytes: 0 };
    buffers.set(bed.id, entry);
    entry.decoding.then(
      (buffer) => {
        entry.bytes = decodedBytes(buffer);
        evictToBudget(bed.id);
      },
      () => {
        if (buffers.get(bed.id) === entry) buffers.delete(bed.id);
      },
    );
    return entry.decoding;
  }

  function startSource(
    cueId: string,
    buffer: MixerBuffer,
    bed: ResolvedBed,
    pendingBed: PendingBed,
  ): void {
    const { context: ctx, graph: g } = ensureGraph();
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const loopStart = Math.min(bed.loopStartMs / 1000, buffer.duration);
    const loopEnd = Math.min(bed.loopEndMs / 1000, buffer.duration);
    source.loopStart = loopStart;
    source.loopEnd = loopEnd > loopStart ? loopEnd : buffer.duration;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(
      dbToLinear(pendingBed.gainDb),
      now + pendingBed.fadeMs / 1000,
    );
    source.connect(gain);
    gain.connect(g.master);
    source.start(now, loopStart);
    sounding.set(cueId, { source, gain });
  }

  function start(command: Extract<BedCommand, { type: 'start' }>): void {
    if (sounding.has(command.cueId) || pending.has(command.cueId)) return;
    const resolved = options.resolveBed(command.category);
    if (!resolved) return;

    const { context: ctx } = ensureGraph();
    const token = Symbol(command.cueId);
    const bed: PendingBed = { token, gainDb: command.gainDb, fadeMs: command.fadeMs };
    pending.set(command.cueId, bed);

    loadBuffer(resolved, ctx).then(
      (buffer) => {
        const current = pending.get(command.cueId);
        if (disposed || !current || current.token !== token) return;
        pending.delete(command.cueId);
        startSource(command.cueId, buffer, resolved, current);
      },
      (error: unknown) => {
        const current = pending.get(command.cueId);
        if (current?.token === token) pending.delete(command.cueId);
        options.onError?.(error);
      },
    );
  }

  function stop(cueId: string, fadeMs: number): void {
    pending.delete(cueId);
    const bed = sounding.get(cueId);
    if (!bed || !context) return;
    sounding.delete(cueId);
    const now = context.currentTime;
    const endAt = now + fadeMs / 1000;
    rampTo(bed.gain.gain, 0, fadeMs, now);
    bed.source.stop(endAt);
    retired.push({ ...bed, endAt });
  }

  function retarget(cueId: string, gainDb: number, rampMs: number): void {
    const waiting = pending.get(cueId);
    if (waiting) waiting.gainDb = gainDb;
    const bed = sounding.get(cueId);
    if (bed && context) {
      rampTo(bed.gain.gain, dbToLinear(gainDb), rampMs, context.currentTime);
    }
  }

  return {
    apply(commands) {
      if (disposed) return;
      const starts = commands.some((command) => command.type === 'start');
      // Nothing is created until a bed starts. A stop before any start has nothing to stop.
      if (!starts && context === null) return;
      const { context: ctx } = ensureGraph();
      if (starts) resumeIfSuspended(ctx);
      sweepRetired(ctx.currentTime);
      for (const command of commands) {
        if (command.type === 'start') start(command);
        else if (command.type === 'stop') stop(command.cueId, command.fadeMs);
        else retarget(command.cueId, command.gainDb, command.rampMs);
      }
    },

    setMasterGain(gain) {
      if (disposed) return;
      if (!(gain >= 0 && gain <= 1)) {
        throw new RangeError(`master gain must be between 0 and 1, got ${gain}`);
      }
      masterGain = gain;
      if (context && graph) rampTo(graph.master.gain, gain, MASTER_RAMP_MS, context.currentTime);
    },

    setDucking(ramp) {
      if (disposed) return;
      ducking = ramp;
      if (context && graph) {
        rampTo(graph.ducking.gain, dbToLinear(ramp.gainDb), ramp.rampMs, context.currentTime);
      }
    },

    suspend() {
      if (disposed || !context || suspended) return;
      if (sounding.size > 0 || pending.size > 0) return;
      suspended = true;
      context.suspend?.().catch((error: unknown) => options.onError?.(error));
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      for (const bed of sounding.values()) bed.source.stop();
      sounding.clear();
      pending.clear();
      buffers.clear();
      retired.length = 0;
      const closing = context?.close();
      context = null;
      graph = null;
      closing?.catch((error: unknown) => options.onError?.(error));
    },
  };
}

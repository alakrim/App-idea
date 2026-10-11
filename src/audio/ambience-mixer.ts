import type { BedCommand } from '@/core/playback/ambience-scheduler';
import { type DuckRamp, dbToLinear } from '@/core/playback/ducking';

/** Master on/off fades over this long, so toggling ambience never clicks. */
const MASTER_RAMP_MS = 300;
const DEFAULT_CACHE_SIZE = 4;

/** A bundled bed the category resolved to. `asset` is the `require()` id that decodes it. */
export interface ResolvedBed {
  id: string;
  asset: number;
}

export type ResolveBed = (categoryId: string) => ResolvedBed | null;

/*
 * The subset of react-native-audio-api 0.13 used here. Each interface is structurally satisfied by
 * the library's AudioContext, AudioBufferSourceNode, GainNode and AudioParam, which keeps this
 * module importable and testable in Node without the native module.
 */
export interface MixerBuffer {
  readonly duration: number;
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
  start(when?: number): void;
  stop(when?: number): void;
}

export interface MixerContext {
  readonly currentTime: number;
  readonly destination: MixerNode;
  decodeAudioData(asset: number): Promise<MixerBuffer>;
  createBufferSource(): MixerBufferSource;
  createGain(): MixerGain;
  close(): Promise<void>;
}

export interface AmbienceMixer {
  /** Applies planner commands. Unknown categories are skipped without an error. */
  apply(commands: readonly BedCommand[]): void;
  /** Fades the whole ambience bus in or out. Beds keep their state while it is off. */
  setMaster(enabled: boolean): void;
  /** Ramps the ducking stage that sits between the master bus and the output. */
  setDucking(ramp: DuckRamp): void;
  dispose(): void;
}

export interface AmbienceMixerOptions {
  resolveBed: ResolveBed;
  /** Creates the audio context on first use, so nothing touches native audio until needed. */
  createContext: () => MixerContext;
  /** Decoded buffers kept in memory. The default is 4. */
  cacheSize?: number;
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

/** Schedules a linear ramp from the param's current value. Cancelling first keeps it predictable. */
function rampTo(param: MixerParam, value: number, rampMs: number, now: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.linearRampToValueAtTime(value, now + rampMs / 1000);
}

/**
 * Plays ambience beds on one AudioContext: each bed is a looping buffer source into its own gain,
 * then into the master gain and the ducking gain. Every fade is scheduled on the audio clock, so
 * a stop can never leave an orphan source running. Decoded buffers live in a small LRU cache.
 */
export function createAmbienceMixer(options: AmbienceMixerOptions): AmbienceMixer {
  const cacheSize = options.cacheSize ?? DEFAULT_CACHE_SIZE;
  let context: MixerContext | null = null;
  let graph: Graph | null = null;
  let disposed = false;
  const sounding = new Map<string, SoundingBed>();
  const pending = new Map<string, PendingBed>();
  const retired: RetiredBed[] = [];
  const buffers = new Map<string, Promise<MixerBuffer>>();

  function ensureGraph(): { context: MixerContext; graph: Graph } {
    if (!context || !graph) {
      const created = options.createContext();
      const master = created.createGain();
      const ducking = created.createGain();
      master.gain.value = 1;
      ducking.gain.value = 1;
      master.connect(ducking);
      ducking.connect(created.destination);
      context = created;
      graph = { master, ducking };
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

  function loadBuffer(bed: ResolvedBed, decodeContext: MixerContext): Promise<MixerBuffer> {
    const cached = buffers.get(bed.id);
    if (cached) {
      buffers.delete(bed.id);
      buffers.set(bed.id, cached);
      return cached;
    }
    const decoding = decodeContext.decodeAudioData(bed.asset);
    buffers.set(bed.id, decoding);
    decoding.catch(() => {
      if (buffers.get(bed.id) === decoding) buffers.delete(bed.id);
    });
    for (const oldest of buffers.keys()) {
      if (buffers.size <= cacheSize) break;
      buffers.delete(oldest);
    }
    return decoding;
  }

  function startSource(cueId: string, buffer: MixerBuffer, pendingBed: PendingBed): void {
    const { context: ctx, graph: g } = ensureGraph();
    const now = ctx.currentTime;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = buffer.duration;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(dbToLinear(pendingBed.gainDb), now + pendingBed.fadeMs / 1000);
    source.connect(gain);
    gain.connect(g.master);
    source.start(now);
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
        startSource(command.cueId, buffer, current);
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
      const { context: ctx } = ensureGraph();
      sweepRetired(ctx.currentTime);
      for (const command of commands) {
        if (command.type === 'start') start(command);
        else if (command.type === 'stop') stop(command.cueId, command.fadeMs);
        else retarget(command.cueId, command.gainDb, command.rampMs);
      }
    },

    setMaster(enabled) {
      if (disposed) return;
      const { context: ctx, graph: g } = ensureGraph();
      rampTo(g.master.gain, enabled ? 1 : 0, MASTER_RAMP_MS, ctx.currentTime);
    },

    setDucking(ramp) {
      if (disposed) return;
      const { context: ctx, graph: g } = ensureGraph();
      rampTo(g.ducking.gain, dbToLinear(ramp.gainDb), ramp.rampMs, ctx.currentTime);
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

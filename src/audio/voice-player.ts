import {
  type AudioMetadata,
  type AudioPlayer,
  type AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
} from 'expo-audio';

import type { Unsubscribe } from './engine';
import type { VoiceMetadata, VoicePort, VoiceSegment, VoiceSnapshot } from './voice-port';

const UPDATE_INTERVAL_MS = 250;
const LOCK_SCREEN_OPTIONS = { showSeekForward: false, showSeekBackward: false } as const;

/**
 * One of two players. The active slot plays segment `index` and owns the lock screen. The other
 * slot is preloaded with `index + 1`, so the swap at a segment boundary is a play() call on a
 * ready player rather than a load.
 */
interface Slot {
  player: AudioPlayer;
  /** Segment index this player holds, or null when it is empty. */
  holds: number | null;
  /** Position to seek to once the held segment is ready. Applied only while the slot is active. */
  pendingSeekMs: number | null;
  /** True once the platform reports the held segment as loaded. */
  loaded: boolean;
  unsubscribe: Unsubscribe;
}

/**
 * Narration player on expo-audio 57 (types: `AudioPlayer`, `AudioStatus`, `setAudioModeAsync`).
 *
 * Why two players and not `AudioPlaylist`: the 57.0.5 typings expose lock-screen control only on
 * `AudioPlayer` (`setActiveForLockScreen`). `AudioPlaylist` has no lock-screen method, and it does
 * not expose a pitch-correction switch. The swap leaves a gap of one status-event latency, so S1
 * must measure it against a playlist before the choice is final.
 */
export function createVoicePlayer(): VoicePort {
  let segments: VoiceSegment[] = [];
  let starts: number[] = [];
  let slots: [Slot, Slot] | null = null;
  let active: 0 | 1 = 0;
  let index = 0;
  let ended = false;
  let wantPlaying = false;
  let rate = 1;
  let volume = 1;
  let metadata: VoiceMetadata = { title: '', seriesTitle: '', coverUri: null };
  /** Bumped by every load and by dispose. A load that finds it moved on creates nothing. */
  let loadToken = 0;
  let disposed = false;
  /** The position the next load starts at. A seek made before the players exist moves it. */
  let requestedStartMs = 0;
  const listeners = new Set<(snapshot: VoiceSnapshot) => void>();

  const totalMs = () => (starts.at(-1) ?? 0) + (segments.at(-1)?.durationMs ?? 0);

  function recomputeStarts(): void {
    starts = [];
    let total = 0;
    for (const segment of segments) {
      starts.push(total);
      total += segment.durationMs;
    }
  }

  /** Segment index and offset for a media position, clamped to the available audio. */
  function locate(ms: number): { segmentIdx: number; offsetMs: number } {
    if (segments.length === 0) return { segmentIdx: 0, offsetMs: 0 };
    const clamped = Math.min(Math.max(0, ms), totalMs());
    let segmentIdx = 0;
    for (let i = 0; i < starts.length; i += 1) {
      if ((starts[i] ?? 0) <= clamped) segmentIdx = i;
    }
    return { segmentIdx, offsetMs: clamped - (starts[segmentIdx] ?? 0) };
  }

  function lockScreenMetadata(): AudioMetadata {
    return {
      title: metadata.title,
      artist: metadata.seriesTitle,
      albumTitle: metadata.seriesTitle,
      ...(metadata.coverUri ? { artworkUrl: metadata.coverUri } : {}),
    };
  }

  function emit(snapshot: VoiceSnapshot): void {
    for (const listener of listeners) listener(snapshot);
  }

  function loadSlot(slot: Slot, segmentIdx: number | null, seekMs: number | null): void {
    if (segmentIdx === null || segments[segmentIdx] === undefined) {
      slot.player.pause();
      slot.player.clearLockScreenControls();
      slot.holds = null;
      slot.pendingSeekMs = null;
      return;
    }
    const segment = segments[segmentIdx];
    if (!segment) return;
    slot.player.pause();
    slot.player.replace({ uri: segment.uri });
    slot.player.setPlaybackRate(rate, 'high');
    slot.player.volume = volume;
    slot.holds = segmentIdx;
    slot.loaded = false;
    slot.pendingSeekMs = seekMs;
  }

  function makeSlot(slotIdx: 0 | 1): Slot {
    const player = createAudioPlayer(null, { updateInterval: UPDATE_INTERVAL_MS });
    const slot: Slot = {
      player,
      holds: null,
      pendingSeekMs: null,
      loaded: false,
      unsubscribe: () => undefined,
    };
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      onStatus(slot, slotIdx, status);
    });
    slot.unsubscribe = () => subscription.remove();
    return slot;
  }

  function otherSlotIndex(): 0 | 1 {
    return active === 0 ? 1 : 0;
  }

  function activate(slot: Slot): void {
    const [a, b] = slots ?? [];
    if (!a || !b) return;
    for (const other of [a, b]) {
      if (other !== slot) other.player.clearLockScreenControls();
    }
    slot.player.setActiveForLockScreen(true, lockScreenMetadata(), LOCK_SCREEN_OPTIONS);
  }

  /** Makes the preloaded slot active and preloads the one after it. */
  function advance(): void {
    const next = index + 1;
    const finished = slots?.[active];
    if (!slots || !finished) return;
    const incoming = slots[otherSlotIndex()];
    if (next >= segments.length) {
      ended = true;
      finished.player.clearLockScreenControls();
      emit({
        positionMs: totalMs(),
        playing: false,
        buffering: false,
        ended: true,
        loaded: true,
        error: null,
      });
      return;
    }
    if (incoming.holds !== next) loadSlot(incoming, next, null);
    active = otherSlotIndex();
    index = next;
    incoming.pendingSeekMs = null;
    loadSlot(finished, next + 1 < segments.length ? next + 1 : null, null);
    activate(incoming);
    if (wantPlaying) incoming.player.play();
  }

  function onStatus(slot: Slot, slotIdx: 0 | 1, status: AudioStatus): void {
    if (!slots || slot.holds === null) return;
    if (slotIdx !== active) return;

    slot.loaded = status.isLoaded;
    if (status.isLoaded && slot.pendingSeekMs !== null) {
      const seekMs = slot.pendingSeekMs;
      slot.pendingSeekMs = null;
      if (seekMs > 0) void slot.player.seekTo(seekMs / 1000);
      if (wantPlaying) slot.player.play();
    }
    if (status.didJustFinish) {
      advance();
      return;
    }
    ended = false;
    emit({
      positionMs: (starts[index] ?? 0) + status.currentTime * 1000,
      playing: status.playing,
      buffering: status.isBuffering,
      ended: false,
      loaded: status.isLoaded,
      error: status.error,
    });
  }

  function releaseSlots(): void {
    for (const slot of slots ?? []) {
      slot.unsubscribe();
      slot.player.clearLockScreenControls();
      slot.player.remove();
    }
    slots = null;
    segments = [];
    starts = [];
    ended = false;
    wantPlaying = false;
  }

  return {
    async load(nextSegments, startMs, nextMetadata) {
      if (disposed) return;
      const token = ++loadToken;
      releaseSlots();
      segments = [...nextSegments];
      recomputeStarts();
      metadata = nextMetadata;
      requestedStartMs = startMs;
      active = 0;
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
        allowsRecording: false,
        shouldRouteThroughEarpiece: false,
      });
      // A newer load or a dispose came in while the audio mode was being set. Create nothing.
      if (token !== loadToken || disposed) return;
      const created: [Slot, Slot] = [makeSlot(0), makeSlot(1)];
      slots = created;
      ended = false;
      wantPlaying = false;
      const located = locate(requestedStartMs);
      index = located.segmentIdx;
      loadSlot(created[0], index, located.offsetMs);
      loadSlot(created[1], index + 1 < segments.length ? index + 1 : null, null);
      activate(created[0]);
    },

    append(more) {
      if (more.length === 0) return;
      segments = [...segments, ...more];
      recomputeStarts();
      if (!slots) return;
      const incoming = slots[otherSlotIndex()];
      if (incoming.holds === null && index + 1 < segments.length) {
        loadSlot(incoming, index + 1, null);
      }
      if (ended) {
        ended = false;
        advance();
      }
    },

    play() {
      wantPlaying = true;
      if (!slots || ended) return;
      slots[active].player.play();
    },

    pause() {
      wantPlaying = false;
      slots?.[active].player.pause();
    },

    async seekTo(ms) {
      if (!slots) {
        // Before the players exist, the seek becomes the position the load starts from.
        requestedStartMs = ms;
        return;
      }
      const located = locate(ms);
      ended = false;
      const current = slots[active];
      if (located.segmentIdx === index && current.holds === index) {
        if (current.loaded) {
          await current.player.seekTo(located.offsetMs / 1000);
        } else {
          // Not ready yet: the seek is applied as soon as the segment loads, not overwritten by it.
          current.pendingSeekMs = located.offsetMs;
        }
        return;
      }
      current.player.pause();
      index = located.segmentIdx;
      loadSlot(current, index, located.offsetMs);
      loadSlot(slots[otherSlotIndex()], index + 1 < segments.length ? index + 1 : null, null);
    },

    setRate(nextRate) {
      rate = nextRate;
      for (const slot of slots ?? []) slot.player.setPlaybackRate(rate, 'high');
    },

    setVolume(nextVolume) {
      volume = nextVolume;
      for (const slot of slots ?? []) slot.player.volume = volume;
    },

    onSnapshot(callback) {
      listeners.add(callback);
      return () => {
        listeners.delete(callback);
      };
    },

    dispose() {
      disposed = true;
      loadToken += 1;
      releaseSlots();
      listeners.clear();
    },
  };
}

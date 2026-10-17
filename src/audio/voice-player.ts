import {
  type AudioMetadata,
  type AudioPlayer,
  type AudioStatus,
  createAudioPlayer,
  setAudioModeAsync,
} from 'expo-audio';

import { createPlaybackHealthLog, type PlaybackHealthLog } from '@/core/playback/playback-health';
import { systemTimers, type TimerPort } from '@/core/playback/timers';

import type { Unsubscribe } from './engine';
import type { VoiceMetadata, VoicePort, VoiceSegment, VoiceSnapshot } from './voice-port';

const UPDATE_INTERVAL_MS = 250;
const LOCK_SCREEN_OPTIONS = { showSeekForward: false, showSeekBackward: false } as const;
/**
 * The incoming segment starts this long before the outgoing one ends. Starting it on the outgoing
 * `didJustFinish` costs a JS round trip and a native start; starting it early hides that latency.
 * TTS segments end in silence, so the overlap of at most this long is not heard.
 */
export const PRE_ROLL_MS = 80;
/**
 * After the voice runs dry, narration resumes only with this much audio past the point it ran out
 * (or once the chapter is final). Shorter resumes stop and start the narration every few seconds.
 */
export const RESUME_LEAD_MS = 10_000;
/** How far past its start a freshly loaded file may report and still count as the new file. */
const FILE_START_SLACK_MS = 1_000;

export interface VoicePlayerOptions {
  /** Where boundary gaps, buffering and system pauses are recorded. Defaults to a private log. */
  health?: PlaybackHealthLog;
  /** Schedules the pre-roll. Tests drive it with a virtual clock. */
  timers?: TimerPort;
}

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
  /**
   * False from each load or seek until the new file's first fresh status (its generation). Statuses
   * before that belong to the file the slot replaced, and are ignored.
   */
  reported: boolean;
  /** Play the held segment as soon as it reports loaded, because it was promoted before it was ready. */
  startWhenLoaded: boolean;
  unsubscribe: Unsubscribe;
}

/**
 * Narration player on expo-audio 57 (types: `AudioPlayer`, `AudioStatus`, `setAudioModeAsync`).
 *
 * Why two players and not `AudioPlaylist`: the 57.0.5 typings expose lock-screen control only on
 * `AudioPlayer` (`setActiveForLockScreen`). `AudioPlaylist` has no lock-screen method, and it does
 * not expose a pitch-correction switch.
 *
 * The boundary is a pre-roll. When the active segment has about PRE_ROLL_MS left and the incoming
 * one is loaded, the incoming player starts. When it reports playing, the outgoing one is stopped
 * and the two swap roles. The active player is always playing across the boundary, so expo-audio
 * never releases audio focus there.
 */
export function createVoicePlayer(options: VoicePlayerOptions = {}): VoicePort {
  const health = options.health ?? createPlaybackHealthLog({ now: Date.now });
  const timers = options.timers ?? systemTimers;
  let segments: VoiceSegment[] = [];
  let starts: number[] = [];
  let slots: [Slot, Slot] | null = null;
  let active: 0 | 1 = 0;
  let index = 0;
  let ended = false;
  /** Media time at which the voice ran dry. The resume lead is measured from here. */
  let dryAtMs = 0;
  let wantPlaying = false;
  let rate = 1;
  let volume = 1;
  let metadata: VoiceMetadata = { title: '', seriesTitle: '', coverUri: null };
  /** Bumped by every load and by dispose. A load that finds it moved on creates nothing. */
  let loadToken = 0;
  let disposed = false;
  /** Whether the active player reported buffering or playing on its last status. For the health log. */
  let buffering = false;
  let playing = false;
  /** True from the pre-roll start until the incoming segment is promoted. */
  let started = false;
  let preRollTimer: unknown = null;
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
    // An empty slot does not touch the lock screen: the active player keeps it, and a released
    // chapter clears it in releaseSlots.
    if (segmentIdx === null || segments[segmentIdx] === undefined) {
      slot.player.pause();
      slot.holds = null;
      slot.pendingSeekMs = null;
      slot.startWhenLoaded = false;
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
    slot.reported = false;
    slot.startWhenLoaded = false;
    slot.pendingSeekMs = seekMs;
  }

  function makeSlot(slotIdx: 0 | 1): Slot {
    const player = createAudioPlayer(null, { updateInterval: UPDATE_INTERVAL_MS });
    const slot: Slot = {
      player,
      holds: null,
      pendingSeekMs: null,
      loaded: false,
      reported: false,
      startWhenLoaded: false,
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

  /**
   * Hands the lock screen to the incoming player. expo-audio moves the session to it in one step.
   * Clearing the outgoing player first would release the MediaSession and drop the foreground
   * notification at every segment boundary (QA-E E-01), so the outgoing player is left alone.
   */
  function activate(slot: Slot): void {
    slot.player.setActiveForLockScreen(true, lockScreenMetadata(), LOCK_SCREEN_OPTIONS);
  }

  function cancelPreRoll(): void {
    if (preRollTimer !== null) timers.clearTimeout(preRollTimer);
    preRollTimer = null;
  }

  /** Plays a slot now if it is loaded, or as soon as it loads. */
  function startPlayer(slot: Slot): void {
    if (slot.loaded) slot.player.play();
    else slot.startWhenLoaded = true;
  }

  /**
   * Starts the incoming segment ahead of the boundary. `endsInMs` is how long the outgoing segment
   * still has to play, for the boundary gap. Only the first call starts it.
   */
  function startIncoming(endsInMs: number): void {
    if (!slots || started || ended || !wantPlaying) return;
    const incoming = slots[otherSlotIndex()];
    if (!incoming.loaded) return;
    started = true;
    health.boundaryStarted(endsInMs);
    incoming.player.play();
  }

  /**
   * Arms the pre-roll from the active player's last status. The timer runs for the remaining audio
   * minus PRE_ROLL_MS. Status arrives about every 250 ms, so each status re-arms it.
   */
  function armPreRoll(current: AudioStatus): void {
    cancelPreRoll();
    if (!slots || started || ended || !wantPlaying) return;
    const next = index + 1;
    const incoming = slots[otherSlotIndex()];
    if (next >= segments.length || incoming.holds !== next || !incoming.loaded) return;
    const remainingMs = (segments[index]?.durationMs ?? 0) - current.currentTime * 1000;
    if (remainingMs <= PRE_ROLL_MS) {
      startIncoming(Math.max(0, remainingMs));
      return;
    }
    preRollTimer = timers.setTimeout(() => {
      preRollTimer = null;
      startIncoming(PRE_ROLL_MS);
    }, remainingMs - PRE_ROLL_MS);
  }

  /**
   * Makes the preloaded slot active, stops the outgoing one and preloads the segment after. The
   * incoming player plays already if the pre-roll started it.
   */
  function promote(): void {
    if (!slots) return;
    cancelPreRoll();
    const outgoing = slots[active];
    const incoming = slots[otherSlotIndex()];
    const next = index + 1;
    const alreadyPlaying = started;
    started = false;
    active = otherSlotIndex();
    index = next;
    buffering = false;
    playing = false;
    incoming.pendingSeekMs = null;
    activate(incoming);
    outgoing.player.pause();
    loadSlot(outgoing, next + 1 < segments.length ? next + 1 : null, null);
    if (!alreadyPlaying && wantPlaying) startPlayer(incoming);
  }

  /**
   * The active segment finished, or the queue has grown after a run dry. Moves on to the next
   * segment. A finish that the pre-roll already covered only completes the swap.
   */
  function advance(resuming: boolean): void {
    if (!slots) return;
    const next = index + 1;
    if (next >= segments.length) {
      // The lock screen stays with the finished player: the chapter is paused, not released.
      ended = true;
      dryAtMs = totalMs();
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
    const incoming = slots[otherSlotIndex()];
    if (!started && !resuming) health.boundaryStarted(0);
    if (incoming.holds !== next) loadSlot(incoming, next, null);
    promote();
  }

  /**
   * A status that can only come from the file a slot was just given: loaded, not finished, and at or
   * before the position it starts from. A load or a seek replaces the file, and the platform may still
   * deliver the finish or the loaded flag of the file it replaced (QA-E E-04).
   */
  function isFreshStatus(slot: Slot, status: AudioStatus): boolean {
    if (!status.isLoaded || status.didJustFinish) return false;
    return status.currentTime * 1000 <= (slot.pendingSeekMs ?? 0) + FILE_START_SLACK_MS;
  }

  function onStatus(slot: Slot, slotIdx: 0 | 1, status: AudioStatus): void {
    if (!slots || slot.holds === null) return;
    // The first status of the new file opens its generation. Until then, every status is ignored.
    if (!slot.reported) {
      if (!isFreshStatus(slot, status)) return;
      slot.reported = true;
    }

    slot.loaded = status.isLoaded;
    if (status.isLoaded && slot.startWhenLoaded) {
      slot.startWhenLoaded = false;
      if (wantPlaying) slot.player.play();
    }
    if (slotIdx !== active) {
      // The pre-rolled segment reports audible playback: the swap completes and the outgoing stops.
      if (started && slotIdx === otherSlotIndex() && status.playing && status.currentTime > 0) {
        health.boundaryPlaying();
        promote();
      }
      return;
    }

    if (status.isLoaded && slot.pendingSeekMs !== null) {
      const seekMs = slot.pendingSeekMs;
      slot.pendingSeekMs = null;
      if (seekMs > 0) void slot.player.seekTo(seekMs / 1000);
      if (wantPlaying) slot.player.play();
    }
    recordHealth(status);
    if (status.didJustFinish) {
      advance(false);
      return;
    }
    // expo-audio clears its own pause only on focus gain, so a call that ended while the listener had
    // paused would start the narration again. The listener's pause holds until they press play.
    const playingNow = status.playing && wantPlaying;
    if (status.playing && !wantPlaying) slot.player.pause();
    if (playingNow) armPreRoll(status);
    else cancelPreRoll();
    ended = false;
    emit({
      positionMs: (starts[index] ?? 0) + status.currentTime * 1000,
      playing: playingNow,
      buffering: status.isBuffering,
      ended: false,
      loaded: status.isLoaded,
      error: status.error,
    });
  }

  /** Feeds the health log from the active player's raw status. */
  function recordHealth(status: AudioStatus): void {
    if (status.isBuffering && !buffering) health.bufferingStarted();
    buffering = status.isBuffering;
    // Closes a boundary that was opened by a finish: the segment that now plays is audible.
    if (status.playing && status.currentTime > 0) health.boundaryPlaying();
    // A pause the system made: the player stopped while the listener still wants it playing.
    const systemPaused =
      playing && !status.playing && wantPlaying && status.isLoaded && !status.isBuffering;
    if (systemPaused) health.focusLossPaused();
    playing = status.playing;
  }

  function releaseSlots(): void {
    cancelPreRoll();
    started = false;
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

    append(more, final = false) {
      if (more.length === 0) return;
      segments = [...segments, ...more];
      recomputeStarts();
      if (!slots) return;
      const incoming = slots[otherSlotIndex()];
      if (incoming.holds === null && index + 1 < segments.length) {
        loadSlot(incoming, index + 1, null);
      }
      // After a run dry, a short segment is not enough to resume on: the voice would run dry again
      // within seconds. It waits for RESUME_LEAD_MS of audio past the point it ran out, or for the end.
      if (ended && (final || totalMs() - dryAtMs >= RESUME_LEAD_MS)) {
        ended = false;
        advance(true);
      }
    },

    play() {
      wantPlaying = true;
      if (!slots || ended) return;
      slots[active].player.play();
    },

    pause() {
      wantPlaying = false;
      cancelPreRoll();
      if (!slots) return;
      if (started) {
        started = false;
        slots[otherSlotIndex()].player.pause();
      }
      slots[active].player.pause();
    },

    async seekTo(ms) {
      if (!slots) {
        // Before the players exist, the seek becomes the position the load starts from.
        requestedStartMs = ms;
        return;
      }
      cancelPreRoll();
      if (started) {
        started = false;
        slots[otherSlotIndex()].player.pause();
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

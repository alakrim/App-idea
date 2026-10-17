import { type AudioPlayer, createAudioPlayer } from 'expo-audio';
import * as Speech from 'expo-speech';

/**
 * A short sample to audition: a clip file (a narrator's preview) or a line of device speech. The
 * playback controller pauses the narration around it, so the sample is the only sound.
 */
export type SampleRequest =
  | { kind: 'clip'; uri: string }
  | { kind: 'speech'; text: string; language: string; voice: string | null; rate: number };

/** The one place samples sound. Starting a sample silences the one before it. */
export interface SampleOutput {
  /** Plays a sample. `onEnd` runs when it finishes on its own, and not when it was replaced or stopped. */
  play(request: SampleRequest, onEnd: () => void): void;
  /** Silences the sample, and the `onEnd` of the sample that was playing does not run. */
  stop(): void;
  dispose(): void;
}

/** The sample output on expo-audio (clips) and expo-speech (device voices). */
export function createSampleOutput(): SampleOutput {
  let player: AudioPlayer | null = null;
  let subscription: { remove(): void } | null = null;
  /** Changes on every play and stop, so a callback from an old sample is ignored. */
  let playToken = 0;
  let currentEnd: (() => void) | null = null;

  function ensurePlayer(): AudioPlayer {
    if (player === null) {
      const created = createAudioPlayer(null);
      player = created;
      subscription = created.addListener('playbackStatusUpdate', (status) => {
        if (!status.didJustFinish) return;
        const end = currentEnd;
        currentEnd = null;
        end?.();
      });
    }
    return player;
  }

  function silence(): void {
    playToken += 1;
    currentEnd = null;
    player?.pause();
    void Speech.stop();
  }

  return {
    play(request, onEnd) {
      silence();
      const token = playToken;
      currentEnd = onEnd;
      if (request.kind === 'clip') {
        const clip = ensurePlayer();
        clip.replace({ uri: request.uri });
        clip.play();
        return;
      }
      const finish = () => {
        if (token !== playToken) return;
        currentEnd = null;
        onEnd();
      };
      Speech.speak(request.text, {
        language: request.language,
        rate: request.rate,
        ...(request.voice ? { voice: request.voice } : {}),
        onDone: finish,
        onStopped: finish,
        onError: finish,
      });
    },
    stop() {
      silence();
    },
    dispose() {
      silence();
      subscription?.remove();
      subscription = null;
      player?.remove();
      player = null;
    },
  };
}

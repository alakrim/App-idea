import { isNarratingAhead } from './ahead-state';
import { usePlaybackContent, usePlayerState } from './player-provider';

/** Whether the player is waiting on narration that is still being made. */
export function useNarratingAhead(): boolean {
  const playState = usePlayerState((state) => state.state);
  const positionMs = usePlayerState((state) => state.positionMs);
  const final = usePlaybackContent((content) => content.final);
  const generatedMs = usePlaybackContent((content) => content.timeline?.totalDurationMs ?? 0);
  return isNarratingAhead({ playState, final, positionMs, generatedMs });
}

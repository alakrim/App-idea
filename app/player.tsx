import { useLocalSearchParams, Stack } from 'expo-router';
import { useEffect, useRef } from 'react';

import { FullPlayer } from '@/features/player/full-player';
import { usePlayChapter, usePlayback } from '@/features/player/player-provider';

/**
 * The full player. `/player?chapterId=` starts that chapter unless it is already loaded, so
 * Library, Series and Chapter screens can open the player straight onto a chapter.
 *
 * The route param is the request, not the state: it is acted on once per change of the param.
 * Auto-advance moves the player to the next chapter while the param still names the chapter the
 * screen was opened with, and that must not start the old chapter again (P1-1).
 */
export default function PlayerScreen() {
  const { chapterId } = useLocalSearchParams<{ chapterId?: string }>();
  const playChapter = usePlayChapter();
  const controller = usePlayback();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!chapterId || chapterId === handledRef.current) return;
    handledRef.current = chapterId;
    if (chapterId !== controller.content.getState().chapterId) {
      playChapter(chapterId);
    }
  }, [chapterId, controller, playChapter]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <FullPlayer />
    </>
  );
}

import { useLocalSearchParams, Stack } from 'expo-router';
import { useEffect } from 'react';

import { FullPlayer } from '@/features/player/full-player';
import { usePlayChapter, usePlaybackContent } from '@/features/player/player-provider';

/**
 * The full player. `/player?chapterId=` starts that chapter unless it is already loaded, so
 * Library, Series and Chapter screens can open the player straight onto a chapter.
 */
export default function PlayerScreen() {
  const { chapterId } = useLocalSearchParams<{ chapterId?: string }>();
  const playChapter = usePlayChapter();
  const loadedChapterId = usePlaybackContent((content) => content.chapterId);

  useEffect(() => {
    if (chapterId && chapterId !== loadedChapterId) {
      playChapter(chapterId);
    }
  }, [chapterId, loadedChapterId, playChapter]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <FullPlayer />
    </>
  );
}

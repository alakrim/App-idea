import { useLocalSearchParams, Stack } from 'expo-router';
import { useEffect, useRef } from 'react';

import { FullPlayer } from '@/features/player/full-player';
import { usePlayChapter, usePlayback } from '@/features/player/player-provider';

/**
 * A sentence index from the route, or null when the param is missing or not a whole number.
 * Bookmarks open the player at their sentence through this param.
 */
function sentenceParam(value: string | undefined): number | null {
  if (value === undefined || value.trim() === '') return null;
  const index = Number(value);
  return Number.isInteger(index) && index >= 0 ? index : null;
}

/**
 * The full player. `/player?chapterId=` starts that chapter at its own saved place unless it is
 * already loaded, so Library, Series and Chapter screens can open the player straight onto a chapter.
 * `&sentence=` starts at that sentence instead, as a bookmark does.
 *
 * The route params are the request, not the state: they are acted on once per change of the params.
 * Auto-advance moves the player to the next chapter while the params still name the chapter the
 * screen was opened with, and that must not start the old chapter again (P1-1).
 */
export default function PlayerScreen() {
  const { chapterId, sentence } = useLocalSearchParams<{ chapterId?: string; sentence?: string }>();
  const playChapter = usePlayChapter();
  const controller = usePlayback();
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!chapterId) return;
    const request = `${chapterId}|${sentence ?? ''}`;
    if (request === handledRef.current) return;
    handledRef.current = request;
    const sentenceIdx = sentenceParam(sentence);
    if (sentenceIdx !== null) {
      controller.jumpToSentence(chapterId, sentenceIdx);
      return;
    }
    if (chapterId !== controller.content.getState().chapterId) {
      playChapter(chapterId);
    }
  }, [chapterId, sentence, controller, playChapter]);

  return (
    <>
      <Stack.Screen options={{ headerShown: false, presentation: 'fullScreenModal' }} />
      <FullPlayer />
    </>
  );
}

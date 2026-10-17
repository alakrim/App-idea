import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useDb } from '@/db/hooks';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { usePipelineRuntime } from '@/features/pipeline/pipeline-provider';
import { useToast } from '@/ui/toast';

import { createPlayableAnnouncer } from './playable-rule';
import { usePlayChapter } from './player-provider';

const FALLBACK_TITLE = 'your chapter';

/**
 * Toasts "Ready to listen" when a chapter's first audio is saved while the app is in the foreground.
 * "Listen" starts the chapter. Mounted under the player, so the action can play it.
 */
export function PlayableAnnouncer() {
  const runtime = usePipelineRuntime();
  const db = useDb();
  const toast = useToast();
  const play = usePlayChapter();

  useEffect(() => {
    if (!runtime) return undefined;
    const announcer = createPlayableAnnouncer();
    return runtime.subscribeEvents((event) => {
      const chapterId = announcer.handle(event, AppState.currentState === 'active');
      if (chapterId === null) return;
      const title = chapterRepo.get(db, chapterId)?.title ?? FALLBACK_TITLE;
      toast.show({
        message: `Ready to listen: ${title}`,
        tone: 'success',
        action: { label: 'Listen', onPress: () => play(chapterId) },
      });
    });
  }, [runtime, db, toast, play]);

  return null;
}

import { router } from 'expo-router';

import { useDb } from '@/db/hooks';
import { cueRepo } from '@/db/repos/cue-repo';
import { usePipeline } from '@/features/pipeline/facade';
import { useChapterProgressMap } from '@/features/pipeline/use-chapter-progress';
import { useDbRead } from '@/features/shared/use-db-read';
import { ErrorState } from '@/ui/error-state';
import { Screen } from '@/ui/screen';

import { CHAPTER_SCREEN_TABLES, readChapterScreen } from './chapter-data';
import { ChapterView } from './chapter-view';

export interface ChapterScreenProps {
  chapterId: string;
}

/** The chapter screen: reads the chapter, its text and cues, and writes cue switches straight to the DB. */
export function ChapterScreen({ chapterId }: ChapterScreenProps) {
  const data = useDbRead(readChapterScreen, CHAPTER_SCREEN_TABLES, chapterId);
  const progress = useChapterProgressMap([chapterId])[chapterId] ?? null;
  const pipeline = usePipeline();
  const db = useDb();

  if (data.chapter === null) {
    return (
      <Screen scrollable={false} edges={['top', 'bottom']}>
        <ErrorState
          title="Chapter not found"
          message="It may have been deleted. Go back to the series."
          retryLabel="Go back"
          onRetry={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        />
      </Screen>
    );
  }

  const failure = data.jobs.find((job) => job.status === 'failed')?.error ?? null;

  return (
    <ChapterView
      chapter={data.chapter}
      series={data.series}
      progress={progress}
      failure={failure}
      jobs={data.jobs}
      paragraphs={data.paragraphs}
      cues={data.cues}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
      onPlay={(id) => router.push({ pathname: '/player', params: { chapterId: id } })}
      onRetry={(id) => pipeline.retry(id)}
      onToggleCue={(cueId, enabled) => cueRepo.setEnabled(db, cueId, enabled)}
    />
  );
}

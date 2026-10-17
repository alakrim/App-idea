import { Redirect, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';

import { AddChapterForm } from '@/features/chapter/add-chapter-screen';
import { ChapterView } from '@/features/chapter/chapter-view';
import type { LibrarySort } from '@/features/library/library-data';
import { LibraryView } from '@/features/library/library-view';
import { PipelineContext, type PipelineFacade } from '@/features/pipeline/facade';
import { fakeEstimate, fakePreview } from '@/features/pipeline/fake-facade';
import { SeriesForm } from '@/features/series/series-form';
import { SeriesView } from '@/features/series/series-view';
import {
  chapterScreenFixture,
  libraryEntriesFixture,
  seriesScreenFixture,
} from '@/features/shared/screen-fixtures';
import { Screen } from '@/ui/screen';

import type { ReactNode } from 'react';

const NOT_AVAILABLE = 'Not available in the screen gallery.';

/** Previews and estimates only: the other calls need a database, which the web gallery does not have. */
const previewPipeline: PipelineFacade = {
  previewUrl: async (url) => fakePreview(url),
  estimate: async (input) => fakeEstimate(input),
  createChapter: async () => {
    throw new Error(NOT_AVAILABLE);
  },
  enqueue: () => undefined,
  cancel: () => undefined,
  retry: () => undefined,
  retryNow: () => undefined,
  retryWithOcr: () => undefined,
  subscribe: () => () => undefined,
};

/** Dev-only visual QA of the populated feature screens, with fake data. Redirects in release builds. */
/** Forms bring their own gutter, so the screen adds none. */
const FLUSH = { paddingHorizontal: 0, paddingBottom: 0, gap: 0 } as const;

export default function ScreensRoute() {
  if (!__DEV__) {
    return <Redirect href="/" />;
  }
  return <Screens />;
}

function Screens() {
  const { screen } = useLocalSearchParams<{ screen?: string }>();

  switch (screen) {
    case 'series':
      return <SeriesGallery />;
    case 'chapter':
      return <ChapterGallery />;
    case 'add':
      return (
        <PipelineContext.Provider value={previewPipeline}>
          <Screen edges={['bottom']} scrollable={false} contentStyle={FLUSH}>
            <AddChapterForm seriesId="gallery" sourceLang="en" targetLang="it" />
          </Screen>
        </PipelineContext.Provider>
      );
    case 'new':
      return (
        <Screen edges={['bottom']} scrollable={false} contentStyle={FLUSH}>
          <SeriesForm
            initial={{
              title: '',
              coverUri: null,
              coverTint: null,
              sourceLang: null,
              targetLang: null,
            }}
            submitLabel="Create series"
            onSubmit={() => undefined}
          />
        </Screen>
      );
    default:
      return <LibraryGallery />;
  }
}

function LibraryGallery() {
  const entries = useMemo(() => libraryEntriesFixture(), []);
  const [sort, setSort] = useState<LibrarySort>('recent');
  return (
    <Screen title="Library" scrollable={false}>
      <LibraryView
        entries={entries}
        sort={sort}
        onSortChange={setSort}
        onOpenSeries={() => undefined}
        onSeriesMenu={() => undefined}
        onPlay={() => undefined}
        onCreateSeries={() => undefined}
      />
    </Screen>
  );
}

function SeriesGallery() {
  const fixture = useMemo(() => seriesScreenFixture(), []);
  return (
    <SeriesView
      series={fixture.series}
      chapters={fixture.chapters}
      ocrPrices={fixture.ocrPrices}
      playTarget={{ chapterId: fixture.resumeChapterId, resume: true }}
      currentChapterId={fixture.resumeChapterId}
      bookmarks={[]}
      onBookmarks={() => undefined}
      onBack={() => undefined}
      onMenu={() => undefined}
      onPlay={() => undefined}
      onAddChapter={() => undefined}
      onOpenChapter={() => undefined}
      onChapterMenu={() => undefined}
      onChapterAction={() => undefined}
      onRetry={() => undefined}
      onOcr={() => undefined}
    />
  );
}

function ChapterGallery(): ReactNode {
  const fixture = useMemo(() => chapterScreenFixture(), []);
  return (
    <ChapterView
      chapter={fixture.chapter}
      series={fixture.series}
      progress={null}
      failure={null}
      jobs={[]}
      paragraphs={fixture.paragraphs}
      cues={fixture.cues}
      onBack={() => undefined}
      onPlay={() => undefined}
      onRetry={() => undefined}
      onRetryNow={() => undefined}
      onPrepare={() => undefined}
      onStop={() => undefined}
      onToggleCue={() => undefined}
    />
  );
}

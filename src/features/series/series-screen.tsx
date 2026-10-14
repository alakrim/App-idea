import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useDb, useLiveRead } from '@/db/hooks';
import type { BookmarkItem } from '@/features/bookmarks/bookmark-data';
import { BookmarkNoteSheet } from '@/features/bookmarks/bookmark-note-sheet';
import { removeBookmark, setBookmarkNote } from '@/features/bookmarks/bookmark-service';
import { BookmarksSheet } from '@/features/bookmarks/bookmarks-sheet';
import { isScannedPdfFailure, rowStateOf } from '@/features/chapter/chapter-status';
import { usePipeline } from '@/features/pipeline/facade';
import { useChapterProgressMap } from '@/features/pipeline/use-chapter-progress';
import { ConfirmSheet } from '@/features/shared/confirm-sheet';
import { formatUsd } from '@/features/shared/format';
import { goBackOrHome } from '@/features/shared/navigation';
import { SeriesActionsSheet } from '@/features/shared/series-actions-sheet';
import { ErrorState } from '@/ui/error-state';
import { Screen } from '@/ui/screen';

import {
  chapterAvailability,
  type ChapterAction,
  type ChapterAvailability,
} from './chapter-actions';
import { ChapterActionsSheet } from './chapter-actions-sheet';
import { renarrateMessage } from './renarrate-copy';
import { SERIES_SCREEN_TABLES, playTarget, readSeriesScreen } from './series-data';
import { deleteChapter, deleteSeries, moveChapter } from './series-service';
import { SeriesView, type SeriesChapterItem } from './series-view';
import { useNarrationPrice } from './use-narration-price';
import { useOcrPrices } from './use-ocr-prices';
import { useSeriesDeps } from './use-series-deps';

const NO_ACTIONS: ChapterAvailability = {
  canMoveUp: false,
  canMoveDown: false,
  canRegenerate: false,
  canStop: false,
};

export interface SeriesScreenProps {
  seriesId: string;
}

/** The series screen: live rows, chapter progress, and every action that changes the series. */
export function SeriesScreen({ seriesId }: SeriesScreenProps) {
  const data = useLiveRead(readSeriesScreen, SERIES_SCREEN_TABLES, seriesId);
  const deps = useSeriesDeps();
  const db = useDb();
  const pipeline = usePipeline();
  const removal = useMemo(
    () => ({ ...deps, stopRuns: (chapterIds: readonly string[]) => pipeline.stop(chapterIds) }),
    [deps, pipeline],
  );
  const chapterIds = useMemo(
    () => data.chapters.map((record) => record.chapter.id),
    [data.chapters],
  );
  const progress = useChapterProgressMap(chapterIds);

  const [menuOpen, setMenuOpen] = useState(false);
  const [deletingSeries, setDeletingSeries] = useState(false);
  const [chapterMenuFor, setChapterMenuFor] = useState<string | null>(null);
  const [deletingChapter, setDeletingChapter] = useState<string | null>(null);
  const [ocrFor, setOcrFor] = useState<string | null>(null);
  const [renarrateFor, setRenarrateFor] = useState<string | null>(null);
  const [stoppingFor, setStoppingFor] = useState<string | null>(null);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<BookmarkItem | null>(null);

  // Live progress is newer than the stored job, so its error wins.
  const chapters: SeriesChapterItem[] = data.chapters.map((record) => {
    const live = progress[record.chapter.id] ?? null;
    return { record, progress: live, failure: live?.error ?? record.failure };
  });
  const scannedIds = chapters
    .filter((item) => isScannedPdfFailure(item.record.chapter, item.failure))
    .map((item) => item.record.chapter.id);
  const ocrPrices = useOcrPrices(scannedIds, data.series);
  const menuChapter = data.chapters.find((record) => record.chapter.id === chapterMenuFor) ?? null;
  const availabilityOf = (chapterId: string | null): ChapterAvailability => {
    const index = data.chapters.findIndex((record) => record.chapter.id === chapterId);
    const record = index < 0 ? undefined : data.chapters[index];
    if (record === undefined) return NO_ACTIONS;
    return chapterAvailability({
      index,
      count: data.chapters.length,
      status: record.chapter.status,
      processing: rowStateOf(record.chapter, progress[record.chapter.id] ?? null) === 'processing',
    });
  };
  const runChapterAction = (chapterId: string, action: ChapterAction) => {
    switch (action) {
      case 'move-up':
        moveChapter(deps, chapterId, 'up');
        return;
      case 'move-down':
        moveChapter(deps, chapterId, 'down');
        return;
      case 're-generate':
        setRenarrateFor(chapterId);
        return;
      case 'stop':
        setStoppingFor(chapterId);
        return;
      case 'delete':
        setDeletingChapter(chapterId);
        return;
    }
  };
  const ocrChapter = data.chapters.find((record) => record.chapter.id === ocrFor) ?? null;
  const renarrateChapter =
    data.chapters.find((record) => record.chapter.id === renarrateFor) ?? null;
  const renarratePrice = useNarrationPrice(
    renarrateChapter === null
      ? null
      : {
          wordCount: renarrateChapter.chapter.wordCount,
          sourceLang: data.series?.sourceLang ?? null,
          targetLang: data.series?.targetLang ?? null,
        },
  );
  const stoppingChapter = data.chapters.find((record) => record.chapter.id === stoppingFor) ?? null;
  const menuAvailability = availabilityOf(chapterMenuFor);

  if (data.series === null) {
    return (
      <Screen scrollable={false} edges={['top', 'bottom']}>
        <ErrorState
          title="Series not found"
          message="It may have been deleted. Go back to your library."
          retryLabel="Back to library"
          onRetry={goBack}
        />
      </Screen>
    );
  }
  const series = data.series;

  return (
    <>
      <SeriesView
        series={series}
        chapters={chapters}
        ocrPrices={ocrPrices}
        playTarget={playTarget(data.chapters, data.resumeChapterId)}
        currentChapterId={data.resumeChapterId}
        bookmarks={data.bookmarks}
        onBookmarks={() => setBookmarksOpen(true)}
        onBack={goBack}
        onMenu={() => setMenuOpen(true)}
        onPlay={(chapterId) => router.push({ pathname: '/player', params: { chapterId } })}
        onAddChapter={() => router.push({ pathname: '/chapter/new', params: { seriesId } })}
        onOpenChapter={(chapterId) =>
          router.push({ pathname: '/chapter/[chapterId]', params: { chapterId } })
        }
        onChapterMenu={setChapterMenuFor}
        onChapterAction={runChapterAction}
        onRetry={(chapterId) => pipeline.retry(chapterId)}
        onOcr={setOcrFor}
      />

      <SeriesActionsSheet
        visible={menuOpen}
        seriesTitle={series.title}
        onClose={() => setMenuOpen(false)}
        onEdit={() => {
          setMenuOpen(false);
          router.push({ pathname: '/series/[seriesId]/edit', params: { seriesId } });
        }}
        onDelete={() => {
          setMenuOpen(false);
          setDeletingSeries(true);
        }}
      />

      <ConfirmSheet
        visible={deletingSeries}
        title={`Delete ${series.title}?`}
        message="Its chapters, text and audio are removed from this device. This cannot be undone."
        confirmLabel="Delete series"
        destructive
        onCancel={() => setDeletingSeries(false)}
        onConfirm={() => {
          setDeletingSeries(false);
          void deleteSeries(removal, seriesId).then(goBack);
        }}
      />

      <BookmarksSheet
        visible={bookmarksOpen}
        groups={data.bookmarks}
        onClose={() => setBookmarksOpen(false)}
        onOpen={(chapterId, sentenceIdx) => {
          setBookmarksOpen(false);
          router.push({
            pathname: '/player',
            params: { chapterId, sentence: String(sentenceIdx) },
          });
        }}
        onEditNote={(bookmark) => {
          setBookmarksOpen(false);
          setNoteFor(bookmark);
        }}
        onDelete={(bookmarkId) => removeBookmark(db, bookmarkId)}
      />

      <BookmarkNoteSheet
        bookmark={noteFor}
        onClose={() => setNoteFor(null)}
        onSave={(bookmarkId, note) => {
          setBookmarkNote(db, bookmarkId, note);
          setNoteFor(null);
        }}
      />

      <ChapterActionsSheet
        visible={menuChapter !== null}
        chapterTitle={menuChapter?.chapter.title ?? ''}
        availability={menuAvailability}
        onClose={() => setChapterMenuFor(null)}
        onAction={(action) => {
          const chapterId = chapterMenuFor;
          setChapterMenuFor(null);
          if (chapterId) runChapterAction(chapterId, action);
        }}
      />

      <ConfirmSheet
        visible={stoppingFor !== null}
        title={`Stop preparing ${stoppingChapter?.chapter.title ?? 'this chapter'}?`}
        message="Finished audio is kept, and you can continue later."
        confirmLabel="Stop"
        onCancel={() => setStoppingFor(null)}
        onConfirm={() => {
          if (stoppingFor) pipeline.cancel(stoppingFor);
          setStoppingFor(null);
        }}
      />

      <ConfirmSheet
        visible={renarrateFor !== null}
        title="Re-generate audio?"
        message={renarrateMessage(renarratePrice)}
        confirmLabel={renarratePrice.kind === 'unknown' ? 'Re-generate anyway' : 'Re-generate'}
        confirmDisabled={renarratePrice.kind === 'loading'}
        onCancel={() => setRenarrateFor(null)}
        onConfirm={() => {
          if (renarrateFor) pipeline.retry(renarrateFor, 'narrate');
          setRenarrateFor(null);
        }}
      />

      <ConfirmSheet
        visible={deletingChapter !== null}
        title={`Delete ${data.chapters.find((r) => r.chapter.id === deletingChapter)?.chapter.title ?? 'chapter'}?`}
        message="Its text and audio are removed from this device. This cannot be undone."
        confirmLabel="Delete chapter"
        destructive
        onCancel={() => setDeletingChapter(null)}
        onConfirm={() => {
          if (deletingChapter) void deleteChapter(removal, deletingChapter);
          setDeletingChapter(null);
        }}
      />

      <ConfirmSheet
        visible={ocrChapter !== null}
        title="Read the scanned pages?"
        message={`This PDF has no selectable text, so its pages are read to find the words. Estimated cost for a typical chapter: ${ocrPriceLabel(ocrFor, ocrPrices)}.`}
        confirmLabel="Read pages"
        onCancel={() => setOcrFor(null)}
        onConfirm={() => {
          if (ocrFor) pipeline.retryWithOcr(ocrFor);
          setOcrFor(null);
        }}
      />
    </>
  );
}

function ocrPriceLabel(
  chapterId: string | null,
  prices: Readonly<Record<string, number | null>>,
): string {
  const price = chapterId === null ? undefined : prices[chapterId];
  if (price === undefined) return 'being worked out';
  return price === null ? 'unknown' : `≈ ${formatUsd(price)}`;
}

function goBack(): void {
  goBackOrHome();
}

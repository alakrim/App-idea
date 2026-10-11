import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { isScannedPdfFailure } from '@/features/chapter/chapter-status';
import { usePipeline } from '@/features/pipeline/facade';
import { useChapterProgressMap } from '@/features/pipeline/use-chapter-progress';
import { ConfirmSheet } from '@/features/shared/confirm-sheet';
import { formatUsd } from '@/features/shared/format';
import { SeriesActionsSheet } from '@/features/shared/series-actions-sheet';
import { useDbRead } from '@/features/shared/use-db-read';
import { ErrorState } from '@/ui/error-state';
import { Screen } from '@/ui/screen';

import { ChapterActionsSheet } from './chapter-actions-sheet';
import { SERIES_SCREEN_TABLES, playTarget, readSeriesScreen } from './series-data';
import { deleteChapter, deleteSeries, moveChapter } from './series-service';
import { SeriesView, type SeriesChapterItem } from './series-view';
import { useOcrPrices } from './use-ocr-prices';
import { useSeriesDeps } from './use-series-deps';

export interface SeriesScreenProps {
  seriesId: string;
}

/** The series screen: live rows, chapter progress, and every action that changes the series. */
export function SeriesScreen({ seriesId }: SeriesScreenProps) {
  const data = useDbRead(readSeriesScreen, SERIES_SCREEN_TABLES, seriesId);
  const deps = useSeriesDeps();
  const pipeline = usePipeline();
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

  const scannedIds = data.chapters
    .filter((record) => isScannedPdfFailure(record.chapter, record.failure))
    .map((record) => record.chapter.id);
  const ocrPrices = useOcrPrices(scannedIds, data.series);

  const chapters: SeriesChapterItem[] = data.chapters.map((record) => ({
    record,
    progress: progress[record.chapter.id] ?? null,
  }));
  const menuChapter = data.chapters.find((record) => record.chapter.id === chapterMenuFor) ?? null;
  const menuIndex = data.chapters.findIndex((record) => record.chapter.id === chapterMenuFor);
  const ocrChapter = data.chapters.find((record) => record.chapter.id === ocrFor) ?? null;

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
        onBack={goBack}
        onMenu={() => setMenuOpen(true)}
        onPlay={(chapterId) => router.push({ pathname: '/player', params: { chapterId } })}
        onAddChapter={() => router.push({ pathname: '/chapter/new', params: { seriesId } })}
        onOpenChapter={(chapterId) =>
          router.push({ pathname: '/chapter/[chapterId]', params: { chapterId } })
        }
        onChapterMenu={setChapterMenuFor}
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
          deleteSeries(deps, seriesId);
          goBack();
        }}
      />

      <ChapterActionsSheet
        visible={menuChapter !== null}
        chapterTitle={menuChapter?.chapter.title ?? ''}
        canMoveUp={menuIndex > 0}
        canMoveDown={menuIndex >= 0 && menuIndex < data.chapters.length - 1}
        canRenarrate={menuChapter?.chapter.status === 'ready'}
        onClose={() => setChapterMenuFor(null)}
        onMove={(direction) => {
          if (chapterMenuFor) moveChapter(deps, chapterMenuFor, direction);
          setChapterMenuFor(null);
        }}
        onRenarrate={() => {
          if (chapterMenuFor) pipeline.retry(chapterMenuFor, 'narrate');
          setChapterMenuFor(null);
        }}
        onDelete={() => {
          setDeletingChapter(chapterMenuFor);
          setChapterMenuFor(null);
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
          if (deletingChapter) deleteChapter(deps, deletingChapter);
          setDeletingChapter(null);
        }}
      />

      <ConfirmSheet
        visible={ocrChapter !== null}
        title="Read this PDF with OCR?"
        message={`This PDF has no selectable text, so its pages are read with OCR. Estimated cost for a typical chapter: ${ocrPriceLabel(ocrFor, ocrPrices)}.`}
        confirmLabel="Use OCR"
        onCancel={() => setOcrFor(null)}
        onConfirm={() => {
          if (ocrFor) pipeline.retryWithOcr(ocrFor);
          setOcrFor(null);
        }}
      />
    </>
  );
}

function ocrPriceLabel(chapterId: string | null, prices: Readonly<Record<string, number>>): string {
  const price = chapterId === null ? undefined : prices[chapterId];
  return price === undefined ? 'being worked out' : `≈ ${formatUsd(price)}`;
}

function goBack(): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace('/');
  }
}

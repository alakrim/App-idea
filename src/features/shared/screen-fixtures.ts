/*
 * Fake data for the dev screens gallery (app/dev/screens.tsx). Populated states of the library,
 * series, chapter and add-chapter screens, so they can be reviewed without a device or a database.
 */
import type { AmbienceCue, Chapter, Series } from '@/core/domain';
import type { ReadingParagraph } from '@/features/chapter/chapter-data';
import type { LibraryEntry } from '@/features/library/library-data';
import type { ChapterProgress, StageProgress } from '@/features/pipeline/facade';
import type { SeriesChapterItem } from '@/features/series/series-view';

const NOW = 1_760_000_000_000;
const id = (n: number) => String(n).padStart(26, '0');

function series(n: number, title: string, overrides: Partial<Series> = {}): Series {
  return {
    id: id(n),
    title,
    coverUri: null,
    coverTint: null,
    sourceLang: 'en',
    targetLang: null,
    narrationProfileId: null,
    createdAt: NOW,
    updatedAt: NOW - n * 1000,
    ...overrides,
  };
}

function chapter(
  n: number,
  seriesN: number,
  order: number,
  title: string,
  overrides: Partial<Chapter> = {},
): Chapter {
  return {
    id: id(100 + n),
    seriesId: id(seriesN),
    order,
    title,
    source: { kind: 'url', url: 'https://example.com/chapter' },
    sourceLang: 'en',
    status: 'ready',
    wordCount: 4800,
    durationMs: 25 * 60_000,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

const HARBOUR = series(1, 'The Night Harbour', { coverTint: '#2B3A55', targetLang: 'it' });

export function libraryEntriesFixture(): LibraryEntry[] {
  const summary = (s: Series, chapterCount: number, totalDurationMs: number) => ({
    ...s,
    chapterCount,
    totalDurationMs,
  });
  return [
    {
      series: summary(HARBOUR, 12, 4 * 3_600_000 + 20 * 60_000),
      listening: {
        chapterId: id(102),
        chapterTitle: 'The Bell Buoy',
        chapterNumber: 2,
        chapterCount: 12,
        reachedShare: 2 / 12,
        updatedAt: NOW,
      },
    },
    {
      series: summary(
        series(2, 'Amber Coast', { coverTint: '#5B3A29' }),
        6,
        2 * 3_600_000 + 5 * 60_000,
      ),
      listening: null,
    },
    {
      series: summary(series(3, 'Lanterns of Qin', { coverTint: '#2F4F4F' }), 9, 6 * 3_600_000),
      listening: {
        chapterId: id(301),
        chapterTitle: 'The Caravan Road',
        chapterNumber: 4,
        chapterCount: 9,
        reachedShare: 4 / 9,
        updatedAt: NOW - 5000,
      },
    },
    {
      series: summary(series(4, 'The Quiet Orchard', { coverTint: '#3D4A2B' }), 4, 55 * 60_000),
      listening: null,
    },
    {
      series: summary(series(5, 'Salt & Iron', { coverTint: '#4A2C4A' }), 18, 11 * 3_600_000),
      listening: null,
    },
    {
      series: summary(series(6, '夜の図書館', { coverTint: '#55402A' }), 3, 90 * 60_000),
      listening: null,
    },
  ];
}

const STAGES: StageProgress[] = [
  { stage: 'extract', status: 'done', progress: 1, since: null, passages: null },
  { stage: 'clean', status: 'done', progress: 1, since: null, passages: null },
  { stage: 'segment', status: 'done', progress: 1, since: null, passages: null },
  { stage: 'analyze', status: 'running', progress: 0.42, since: null, passages: null },
  { stage: 'translate', status: 'pending', progress: 0, since: null, passages: null },
  { stage: 'narrate', status: 'pending', progress: 0, since: null, passages: null },
];

function live(
  chapterId: string,
  state: ChapterProgress['state'],
  stages: StageProgress[],
  error: ChapterProgress['error'] = null,
): ChapterProgress {
  return {
    chapterId,
    state,
    stages,
    overall: 0.4,
    readySegments: 0,
    totalSegments: 4,
    costUsdSoFar: 0.012,
    error,
    reconnecting: false,
  };
}

export interface SeriesScreenFixture {
  series: Series;
  chapters: SeriesChapterItem[];
  ocrPrices: Record<string, number | null>;
  resumeChapterId: string;
}

export function seriesScreenFixture(): SeriesScreenFixture {
  const rows: SeriesChapterItem[] = [
    {
      record: {
        chapter: chapter(1, 1, 1, 'The Lamp at Tessport'),
        failure: null,
        listening: null,
        playable: true,
      },
      progress: null,
      failure: null,
    },
    {
      record: {
        listening: null,
        playable: true,
        chapter: chapter(2, 1, 2, 'The Bell Buoy', { durationMs: 27 * 60_000 }),
        failure: null,
      },
      progress: null,
      failure: null,
    },
    {
      record: {
        listening: null,
        playable: false,
        chapter: chapter(3, 1, 3, 'Fog and Oil', { status: 'processing', durationMs: null }),
        failure: null,
      },
      progress: live(id(103), 'running', STAGES),
      failure: null,
    },
    {
      record: {
        listening: null,
        playable: false,
        chapter: chapter(4, 1, 4, 'The Salt Ledger', {
          status: 'failed',
          durationMs: null,
          source: { kind: 'url', url: 'https://example.com/ledger' },
        }),
        failure: {
          code: 'NETWORK',
          message: "We couldn't reach this page. Check your connection, then try again.",
          retryable: true,
        },
      },
      progress: null,
      failure: {
        code: 'NETWORK',
        message: "We couldn't reach this page. Check your connection, then try again.",
        retryable: true,
      },
    },
    {
      record: {
        listening: null,
        playable: false,
        chapter: chapter(5, 1, 5, 'Ledger of the Dead', {
          status: 'failed',
          durationMs: null,
          source: { kind: 'pdf', fileUri: 'file:///scan.pdf', fileName: 'Ledger scan.pdf' },
        }),
        failure: null,
      },
      progress: null,
      failure: {
        code: 'CONTENT_EMPTY',
        message: 'This PDF has no selectable text. It looks like a scan.',
        detail: 'scanned-pdf',
        retryable: false,
      },
    },
  ];
  return {
    series: HARBOUR,
    chapters: rows,
    ocrPrices: { [id(105)]: 0.034 },
    resumeChapterId: id(102),
  };
}

export interface ChapterScreenFixture {
  chapter: Chapter;
  series: Series;
  paragraphs: ReadingParagraph[];
  cues: AmbienceCue[];
}

export function chapterScreenFixture(): ChapterScreenFixture {
  const sentence = (idx: number, text: string, translated: string) => ({ idx, text, translated });
  const paragraphs: ReadingParagraph[] = [
    {
      idx: 0,
      kind: 'heading',
      sentences: [sentence(0, 'The Bell Buoy', 'La boa campana')],
    },
    {
      idx: 1,
      kind: 'text',
      sentences: [
        sentence(
          1,
          'The lamps along the harbour were lit one by one as the fog rolled in from the sea.',
          'Le lampade del porto si accesero una per una mentre la nebbia risaliva dal mare.',
        ),
        sentence(
          2,
          'Mara counted them from the window of the chandler’s loft.',
          'Mara le contò dalla finestra della soffitta del droghiere.',
        ),
      ],
    },
    {
      idx: 2,
      kind: 'quote',
      sentences: [
        sentence(
          3,
          '“Nobody rings that bell after dark,” her father used to say.',
          '«Nessuno suona quella campana dopo il tramonto», diceva sempre suo padre.',
        ),
      ],
    },
    {
      idx: 3,
      kind: 'text',
      sentences: [
        sentence(
          4,
          'Outside, the bell buoy began to toll, slow and patient, and Mara stepped into the grey.',
          'Fuori, la boa campana cominciò a suonare, lenta e paziente, e Mara uscì nel grigio.',
        ),
      ],
    },
  ];
  const cue = (
    n: number,
    category: string,
    startSentence: number,
    endSentence: number,
    enabled: boolean,
    reason: string,
  ): AmbienceCue => ({
    id: id(900 + n),
    chapterId: id(102),
    category,
    startSentence,
    endSentence,
    intensity: 'medium',
    fadeInMs: 1500,
    fadeOutMs: 2000,
    confidence: 0.8,
    reason,
    enabled,
  });
  return {
    chapter: chapter(2, 1, 2, 'The Bell Buoy', {
      sourceLang: 'en',
      durationMs: 27 * 60_000,
      wordCount: 4800,
    }),
    series: HARBOUR,
    paragraphs,
    cues: [
      cue(1, 'harbor_port', 1, 2, true, 'Gulls and water against the quay as the fog comes in.'),
      cue(2, 'ocean_waves', 3, 4, true, 'Slow swell under the bell buoy.'),
      cue(3, 'tavern_crowd', 5, 5, false, 'A distant room full of talk, mentioned by her father.'),
    ],
  };
}

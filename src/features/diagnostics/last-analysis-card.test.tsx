import { screen } from '@testing-library/react-native';

import type { CueReport } from '@/core/analysis/cue-report';
import { chapterRow, id, seriesRow } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { DbContext } from '@/db/hooks';
import { ambienceReportRepo } from '@/db/repos/ambience-report-repo';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import type { Db } from '@/db/types';

import { LastAnalysisCard } from './last-analysis-card';
import { renderThemed } from '../../__tests__/helpers/render-themed';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('expo-sqlite', () => require('../../__tests__/helpers/fake-expo-sqlite'));
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const REPORT: CueReport = {
  model: 'analysis/model',
  promptVersion: 'analysis-v3',
  createdAt: Date.UTC(2026, 9, 17, 12, 0, 0),
  accepted: 2,
  droppedByReason: {
    malformed: 0,
    unknown_category: 0,
    category_not_enabled: 0,
    low_confidence: 1,
    invalid_span: 0,
    too_short: 3,
    merged: 0,
    overlap_limit: 0,
    density_cap: 0,
  },
  coveragePct: 55,
  fallbackRan: true,
  fromCache: false,
};

function seeded(report: CueReport | null): Db {
  const { db } = createTestDb();
  seriesRepo.insert(db, seriesRow(1));
  chapterRepo.insert(db, chapterRow(1, 1, 1));
  if (report) ambienceReportRepo.upsert(db, id(1), report);
  return db;
}

async function renderCard(db: Db) {
  return renderThemed(
    <DbContext.Provider value={db}>
      <LastAnalysisCard />
    </DbContext.Provider>,
  );
}

describe('LastAnalysisCard', () => {
  it('says so when no chapter has been analysed yet', async () => {
    await renderCard(seeded(null));

    expect(screen.getByText('No analysis yet')).toBeOnTheScreen();
    expect(screen.queryByText('Accepted cues')).toBeNull();
  });

  it('shows the latest analysis: accepted cues, coverage, fallback and the drop counts', async () => {
    await renderCard(seeded(REPORT));

    expect(screen.getByText('Accepted cues')).toBeOnTheScreen();
    expect(screen.getByText('2')).toBeOnTheScreen();
    expect(screen.getByText('55% of narration')).toBeOnTheScreen();
    expect(screen.getByText('Ran')).toBeOnTheScreen();
    expect(screen.getByText('Model')).toBeOnTheScreen();
    expect(screen.getByText('Dropped: Low confidence')).toBeOnTheScreen();
    expect(screen.getByText('Dropped: Too short')).toBeOnTheScreen();
    expect(screen.queryByText('Dropped: Density cap')).toBeNull();
    expect(screen.getByText('analysis-v3 · analysis/model')).toBeOnTheScreen();
  });

  it('says cached and no drops when the cues came from the cache', async () => {
    await renderCard(
      seeded({
        ...REPORT,
        fromCache: true,
        fallbackRan: false,
        coveragePct: null,
        droppedByReason: { ...REPORT.droppedByReason, low_confidence: 0, too_short: 0 },
      }),
    );

    expect(screen.getByText('Cache, no cue call')).toBeOnTheScreen();
    expect(screen.getByText('Not needed')).toBeOnTheScreen();
    expect(screen.getByText('No speech time')).toBeOnTheScreen();
    expect(screen.getByText('None')).toBeOnTheScreen();
  });
});

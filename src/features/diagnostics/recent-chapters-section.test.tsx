import { screen } from '@testing-library/react-native';

import { activityText, RecentChaptersSection, stageText } from './recent-chapters-section';
import { renderThemed } from '../../__tests__/helpers/render-themed';

import type { ProbeResult } from './probe';
import type { RecentChapter } from './recent-chapters';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const NO_ACTIVITY = { lastActivityAt: null, stallCount: 0, staleAbortCount: 0 };
/** 2026-10-13 14:02:11 local time, so the clock text can be checked whatever the zone. */
const LAST_ACTIVITY = new Date(2026, 9, 13, 14, 2, 11).getTime();

const CHAPTER: RecentChapter = {
  chapterId: '00000000000000000000000001',
  title: 'The Lamp',
  chapterStatus: 'ready',
  segmentCount: 7,
  audioSeconds: 412.5,
  stages: [
    { stage: 'extract', status: 'done', seconds: 1.2, ...NO_ACTIVITY },
    { stage: 'segment', status: 'done', seconds: 0.1, ...NO_ACTIVITY },
    { stage: 'analyze', status: 'skipped', seconds: null, ...NO_ACTIVITY },
    { stage: 'translate', status: 'not run', seconds: null, ...NO_ACTIVITY },
    {
      stage: 'narrate',
      status: 'failed',
      seconds: 96.4,
      lastActivityAt: LAST_ACTIVITY,
      stallCount: 1,
      staleAbortCount: 2,
    },
  ],
};

function resultWith(chapters: RecentChapter[]): ProbeResult {
  return {
    id: 'recent-chapters',
    group: 'pipeline',
    label: 'Recent chapters: stage timings',
    status: 'pass',
    durationMs: 3,
    values: { chapters: chapters as unknown as ProbeResult['values'][string] },
    message: null,
  };
}

describe('RecentChaptersSection', () => {
  it('shows each chapter with its passages, its audio and every stage with its time', async () => {
    await renderThemed(<RecentChaptersSection result={resultWith([CHAPTER])} />);

    expect(screen.getByText('Recent chapters')).toBeOnTheScreen();
    expect(screen.getByText('The Lamp')).toBeOnTheScreen();
    expect(screen.getByText('7 passages · 412.5 s of audio · ready')).toBeOnTheScreen();
    expect(screen.getByText('done · 1.2 s')).toBeOnTheScreen();
    expect(screen.getByText('failed · 96.4 s')).toBeOnTheScreen();
    expect(screen.getByText('not run')).toBeOnTheScreen();
    expect(screen.getByText('Translate')).toBeOnTheScreen();
  });

  it('shows the last activity and the stall and stale-abort counts of a stage that moved', async () => {
    await renderThemed(<RecentChaptersSection result={resultWith([CHAPTER])} />);

    expect(screen.getByText('last activity 14:02:11 · 1 stall · 2 stale aborts')).toBeOnTheScreen();
  });

  it('names a chapter with no title', async () => {
    await renderThemed(
      <RecentChaptersSection result={resultWith([{ ...CHAPTER, title: '  ' }])} />,
    );
    expect(screen.getByText('Untitled chapter')).toBeOnTheScreen();
  });

  it('says so when no chapter has run yet', async () => {
    await renderThemed(<RecentChaptersSection result={resultWith([])} />);
    expect(screen.getByText('No chapter has run yet')).toBeOnTheScreen();
  });
});

describe('activityText', () => {
  const base = { stage: 'narrate', status: 'done', seconds: 3 } as const;

  it('is null for a stage that never moved', () => {
    expect(activityText({ ...base, ...NO_ACTIVITY })).toBeNull();
  });

  it('leaves out a count that is zero, and uses the singular for one', () => {
    expect(
      activityText({ ...base, lastActivityAt: LAST_ACTIVITY, stallCount: 0, staleAbortCount: 1 }),
    ).toBe('last activity 14:02:11 · 1 stale abort');
    expect(
      activityText({ ...base, lastActivityAt: LAST_ACTIVITY, stallCount: 1, staleAbortCount: 0 }),
    ).toBe('last activity 14:02:11 · 1 stall');
  });
});

describe('stageText', () => {
  it('shows the status with the time when there is one, and the status alone when there is not', () => {
    expect(stageText({ stage: 'narrate', status: 'done', seconds: 12.34, ...NO_ACTIVITY })).toBe(
      'done · 12.3 s',
    );
    expect(stageText({ stage: 'analyze', status: 'skipped', seconds: null, ...NO_ACTIVITY })).toBe(
      'skipped',
    );
  });
});

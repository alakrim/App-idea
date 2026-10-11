/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load helpers with require */
import { fireEvent, screen } from '@testing-library/react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';
import { chapterRow, id, seriesRow, T0 } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { positionRepo } from '@/db/repos/position-repo';
import { seriesRepo } from '@/db/repos/series-repo';

import { readLibrary } from './library-data';
import { LibraryView, type LibraryViewProps } from './library-view';

jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-image', () => require('../../__tests__/helpers/feature-mocks').expoImageStub());

function entries() {
  const { db } = createTestDb();
  seriesRepo.insert(db, seriesRow(1, { title: 'The Night Harbour', updatedAt: T0 + 2 }));
  seriesRepo.insert(db, seriesRow(2, { title: 'Amber Coast', updatedAt: T0 + 1 }));
  chapterRepo.insert(db, chapterRow(11, 1, 1, { title: 'Harbour I', durationMs: 3_600_000 }));
  chapterRepo.insert(db, chapterRow(12, 1, 2, { title: 'Harbour II', durationMs: 1_200_000 }));
  chapterRepo.insert(db, chapterRow(21, 2, 1, { title: 'Coast I', durationMs: 600_000 }));
  positionRepo.record(db, id(1), { chapterId: id(12), sentenceIdx: 2 }, T0 + 100);
  return readLibrary(db);
}

function props(overrides: Partial<LibraryViewProps> = {}): LibraryViewProps {
  return {
    entries: entries(),
    sort: 'recent',
    onSortChange: jest.fn(),
    onOpenSeries: jest.fn(),
    onSeriesMenu: jest.fn(),
    onPlay: jest.fn(),
    onCreateSeries: jest.fn(),
    ...overrides,
  };
}

describe('LibraryView with data', () => {
  it('renders each series with its chapter count, duration and listening share', async () => {
    await renderThemed(<LibraryView {...props()} />);

    expect(
      screen.getByRole('button', {
        name: 'The Night Harbour, 2 chapters · 1 h 20 m, 100 percent listened',
      }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Amber Coast, 1 chapter · 10 m' })).toBeOnTheScreen();
  });

  it('offers the hero for the chapter last heard and starts playback from it', async () => {
    const view = props();
    await renderThemed(<LibraryView {...view} />);

    await fireEvent.press(
      screen.getByRole('button', {
        name: /Continue listening: Harbour II, Chapter 2 of 2, The Night Harbour/,
      }),
    );

    expect(view.onPlay).toHaveBeenCalledWith(id(12));
  });

  it('opens a series on press and the menu on long press', async () => {
    const view = props();
    await renderThemed(<LibraryView {...view} />);

    await fireEvent.press(screen.getByRole('button', { name: /Amber Coast/ }));
    await fireEvent(screen.getByRole('button', { name: /Amber Coast/ }), 'longPress');

    expect(view.onOpenSeries).toHaveBeenCalledWith(id(2));
    expect(view.onSeriesMenu).toHaveBeenCalledWith(id(2));
  });

  it('switches the sort order from the segmented control', async () => {
    const view = props();
    await renderThemed(<LibraryView {...view} />);

    await fireEvent.press(screen.getByRole('radio', { name: 'Title' }));

    expect(view.onSortChange).toHaveBeenCalledWith('title');
  });

  it('shows the empty state with its call to action when there are no series', async () => {
    const view = props({ entries: [] });
    await renderThemed(<LibraryView {...view} />);

    expect(screen.getByRole('header', { name: 'Your shelf is empty' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'New series' }));
    expect(view.onCreateSeries).toHaveBeenCalled();
  });
});

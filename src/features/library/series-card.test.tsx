import { fireEvent, screen } from '@testing-library/react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';
import type { SeriesSummary } from '@/db/repos/series-repo';

import { SeriesCard } from './series-card';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));

const SERIES: SeriesSummary = {
  id: '01HZX00000000000000000000S',
  title: 'Amber Coast',
  coverUri: null,
  coverTint: null,
  sourceLang: 'en',
  targetLang: null,
  narrationProfileId: null,
  createdAt: 0,
  updatedAt: 0,
  chapterCount: 2,
  totalDurationMs: 3_600_000,
};

describe('SeriesCard', () => {
  it('has a visible menu button that is separate from the card that opens the series', async () => {
    const onMenu = jest.fn();
    const onOpen = jest.fn();
    await renderThemed(
      <SeriesCard series={SERIES} reachedShare={null} onOpen={onOpen} onMenu={onMenu} />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Series actions for Amber Coast' }));

    expect(onMenu).toHaveBeenCalledWith(SERIES.id);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('offers the series menu to screen readers as an accessibility action', async () => {
    const onMenu = jest.fn();
    await renderThemed(
      <SeriesCard series={SERIES} reachedShare={null} onOpen={jest.fn()} onMenu={onMenu} />,
    );

    fireEvent(screen.getByRole('button', { name: /^Amber Coast,/ }), 'accessibilityAction', {
      nativeEvent: { actionName: 'menu' },
    });

    expect(onMenu).toHaveBeenCalledWith(SERIES.id);
  });
});

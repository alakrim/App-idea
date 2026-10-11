import { fireEvent, screen } from '@testing-library/react-native';

import { EmptyState } from '@/ui/empty-state';
import { BookOpen } from '@/ui/icons';

import { renderThemed } from '../helpers/render-themed';

// Jest cannot load Reanimated 4's worklets runtime, and lucide ships untransformed ESM.
// Both are mocked per file because jest.config.js is owned by the architect.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));

describe('EmptyState', () => {
  it('shows the title, the description and one call to action', async () => {
    await renderThemed(
      <EmptyState
        icon={BookOpen}
        title="Save words while you listen"
        description="Tap a word to keep it."
        action={{ label: 'Browse', onPress: jest.fn() }}
      />,
    );

    expect(screen.getByRole('header', { name: 'Save words while you listen' })).toBeOnTheScreen();
    expect(screen.getByText('Tap a word to keep it.')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Browse' })).toBeOnTheScreen();
  });

  it('runs the action when the call to action is pressed', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <EmptyState
        icon={BookOpen}
        title="Nothing here"
        description="Add something first."
        action={{ label: 'Add', onPress }}
      />,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Add' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders without a call to action when none is given', async () => {
    await renderThemed(<EmptyState icon={BookOpen} title="Quiet" description="Nothing to do." />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});

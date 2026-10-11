import { fireEvent, screen } from '@testing-library/react-native';
import { BookOpen } from 'lucide-react-native';

import { EmptyState } from '@/ui/empty-state';

import { renderThemed } from '../helpers/render-themed';

// Jest cannot load Reanimated 4's native worklets runtime, and lucide ships untransformed ESM.
// Both are mocked per file because jest.config.js is owned by the architect.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

describe('EmptyState', () => {
  it('shows the title, the description and one call to action', () => {
    renderThemed(
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

  it('runs the action when the call to action is pressed', () => {
    const onPress = jest.fn();
    renderThemed(
      <EmptyState
        icon={BookOpen}
        title="Nothing here"
        description="Add something first."
        action={{ label: 'Add', onPress }}
      />,
    );

    fireEvent.press(screen.getByRole('button', { name: 'Add' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders without a call to action when none is given', () => {
    renderThemed(<EmptyState icon={BookOpen} title="Quiet" description="Nothing to do." />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});

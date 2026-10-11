import { fireEvent, screen } from '@testing-library/react-native';

import { Button } from '@/ui/button';

import { renderThemed } from '../helpers/render-themed';

// Jest cannot load Reanimated 4's native worklets runtime, and lucide ships untransformed ESM.
// Both are mocked per file because jest.config.js is owned by the architect.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

describe('Button', () => {
  it('exposes its label as an accessible button', () => {
    renderThemed(<Button label="Save" onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeOnTheScreen();
  });

  it('calls onPress when enabled', () => {
    const onPress = jest.fn();
    renderThemed(<Button label="Save" onPress={onPress} />);

    fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is busy and ignores presses while loading', () => {
    const onPress = jest.fn();
    renderThemed(<Button label="Save" loading onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Save', busy: true });
    expect(button).toBeDisabled();

    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('is disabled and ignores presses when disabled', () => {
    const onPress = jest.fn();
    renderThemed(<Button label="Continue" disabled onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Continue', disabled: true });
    expect(button).toBeDisabled();

    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

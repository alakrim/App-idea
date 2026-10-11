import { fireEvent, screen } from '@testing-library/react-native';

import { Button } from '@/ui/button';

import { renderThemed } from '../helpers/render-themed';

// Jest cannot load Reanimated 4's worklets runtime, and lucide ships untransformed ESM.
// Both are mocked per file because jest.config.js is owned by the architect.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../helpers/reanimated-stub'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));

describe('Button', () => {
  it('exposes its label as an accessible button', async () => {
    await renderThemed(<Button label="Save" onPress={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'Save' })).toBeOnTheScreen();
  });

  it('calls onPress when enabled', async () => {
    const onPress = jest.fn();
    await renderThemed(<Button label="Save" onPress={onPress} />);

    await fireEvent.press(screen.getByRole('button', { name: 'Save' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('is busy and ignores presses while loading', async () => {
    const onPress = jest.fn();
    await renderThemed(<Button label="Save" loading onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Save', busy: true });
    expect(button).toBeDisabled();

    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('is disabled and ignores presses when disabled', async () => {
    const onPress = jest.fn();
    await renderThemed(<Button label="Continue" disabled onPress={onPress} />);

    const button = screen.getByRole('button', { name: 'Continue', disabled: true });
    expect(button).toBeDisabled();

    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

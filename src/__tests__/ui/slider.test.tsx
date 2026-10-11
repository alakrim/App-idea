import { fireEvent, screen } from '@testing-library/react-native';

import { snapValue, Slider } from '@/ui/slider';

import { renderThemed } from '../helpers/render-themed';

// Jest cannot load Reanimated 4's worklets runtime or gesture-handler's native module. Motion is
// verified on device; these tests check the value logic and the accessibility contract.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('react-native-gesture-handler', () => {
  const pan = {
    enabled: () => pan,
    minDistance: () => pan,
    onBegin: () => pan,
    onUpdate: () => pan,
    onEnd: () => pan,
  };
  return {
    Gesture: { Pan: () => pan },
    GestureDetector: ({ children }: { children: unknown }) => children,
  };
});

describe('snapValue', () => {
  it('snaps to the nearest step from the minimum', () => {
    expect(snapValue(-22.4, -30, -14, 1)).toBe(-22);
    expect(snapValue(0.83, 0.8, 1.2, 0.05)).toBe(0.85);
  });

  it('clamps to the range', () => {
    expect(snapValue(-40, -30, -14, 1)).toBe(-30);
    expect(snapValue(99, -30, -14, 1)).toBe(-14);
  });

  it('never overshoots the end when the range is not a multiple of the step', () => {
    expect(snapValue(1.19, 0.8, 1.2, 0.3)).toBe(1.1);
  });
});

describe('Slider accessibility', () => {
  it('is an adjustable control that reports its value in words', async () => {
    await renderThemed(
      <Slider
        label="Ambience level"
        value={-22}
        min={-30}
        max={-14}
        step={1}
        formatValue={(db) => `${db} dB`}
        onValueChange={jest.fn()}
      />,
    );

    const slider = screen.getByRole('adjustable', { name: 'Ambience level' });
    expect(slider).toHaveAccessibilityValue({ min: -30, max: -14, now: -22, text: '-22 dB' });
  });

  it('steps up and down with the increment and decrement actions', async () => {
    const onValueChange = jest.fn();
    const onValueCommit = jest.fn();
    await renderThemed(
      <Slider
        label="Ambience level"
        value={-22}
        min={-30}
        max={-14}
        step={1}
        onValueChange={onValueChange}
        onValueCommit={onValueCommit}
      />,
    );

    const slider = screen.getByRole('adjustable', { name: 'Ambience level' });
    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    expect(onValueChange).toHaveBeenLastCalledWith(-21);
    expect(onValueCommit).toHaveBeenLastCalledWith(-21);

    await fireEvent(slider, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    expect(onValueChange).toHaveBeenLastCalledWith(-22);
  });

  it('does not move past either end', async () => {
    const onValueChange = jest.fn();
    await renderThemed(
      <Slider
        label="Level"
        value={-14}
        min={-30}
        max={-14}
        step={1}
        onValueChange={onValueChange}
      />,
    );

    await fireEvent(screen.getByRole('adjustable', { name: 'Level' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });

    expect(onValueChange).not.toHaveBeenCalled();
  });

  it('ignores accessibility actions it does not own', async () => {
    const onValueChange = jest.fn();
    await renderThemed(
      <Slider label="Level" value={0} min={0} max={10} onValueChange={onValueChange} />,
    );

    await fireEvent(screen.getByRole('adjustable', { name: 'Level' }), 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });

    expect(onValueChange).not.toHaveBeenCalled();
  });
});

import { screen } from '@testing-library/react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';

import { Chip } from './chip';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));

describe('Chip', () => {
  it('reports a chip that only opens a sheet by its value, never as selected', async () => {
    await renderThemed(<Chip label="Ambience" value="On" onPress={jest.fn()} />);

    const chip = screen.getByRole('button', { name: 'Ambience' });
    expect(chip).toHaveProp('accessibilityValue', { text: 'On' });
    expect(chip.props.accessibilityState?.selected).toBeUndefined();
  });

  it('marks a toggle chip as selected while it is active', async () => {
    await renderThemed(<Chip label="Repeat sentence" active onPress={jest.fn()} />);

    expect(
      screen.getByRole('button', { name: 'Repeat sentence', selected: true }),
    ).toBeOnTheScreen();
  });
});

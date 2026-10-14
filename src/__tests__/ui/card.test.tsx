import { fireEvent, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { Card } from '@/ui/card';

import { renderThemed } from '../helpers/render-themed';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../helpers/reanimated-stub'));

describe('Card', () => {
  it('is a named button when pressable', async () => {
    const onPress = jest.fn();
    await renderThemed(
      <Card onPress={onPress} accessibilityLabel="Chapter 2, The Harbour">
        <Text>The Harbour</Text>
      </Card>,
    );

    await fireEvent.press(screen.getByRole('button', { name: 'Chapter 2, The Harbour' }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('passes its label and grouping to a static card', async () => {
    await renderThemed(
      <Card accessible accessibilityLabel="Vocab: harbour, a port">
        <Text>Harbour</Text>
      </Card>,
    );

    const card = screen.getByLabelText('Vocab: harbour, a port');
    expect(card).toHaveProp('accessible', true);
  });

  it('leaves a static card without a label out of the accessibility tree', async () => {
    await renderThemed(
      <Card testID="plain-card">
        <Text>Plain</Text>
      </Card>,
    );

    expect(screen.getByTestId('plain-card')).not.toHaveProp('accessible', true);
  });

  it('requires a label on a pressable card at the type level', () => {
    // Compiled by `npm run typecheck`: a pressable card with no label must not type-check.
    const withoutLabel = (
      // @ts-expect-error A pressable card needs accessibilityLabel.
      <Card onPress={() => undefined}>
        <Text>Unnamed</Text>
      </Card>
    );
    expect(withoutLabel).toBeTruthy();
  });
});

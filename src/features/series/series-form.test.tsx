/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load helpers with require */
import { fireEvent, screen } from '@testing-library/react-native';

import { renderThemed } from '@/__tests__/helpers/render-themed';

import { SeriesForm } from './series-form';

jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-image', () => require('../../__tests__/helpers/feature-mocks').expoImageStub());
jest.mock('@gorhom/bottom-sheet', () =>
  require('../../__tests__/helpers/feature-mocks').bottomSheetStub(),
);
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

const EMPTY = { title: '', coverUri: null, coverTint: null, sourceLang: null, targetLang: null };

describe('SeriesForm', () => {
  it('keeps Create series disabled until a name is entered', async () => {
    const onSubmit = jest.fn();
    await renderThemed(
      <SeriesForm initial={EMPTY} submitLabel="Create series" onSubmit={onSubmit} />,
    );

    expect(screen.getByRole('button', { name: 'Create series' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Series name'), '   ');
    expect(screen.getByRole('button', { name: 'Create series' })).toBeDisabled();

    await fireEvent.changeText(screen.getByLabelText('Series name'), '  The Night Harbour ');
    await fireEvent.press(screen.getByRole('button', { name: 'Create series' }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'The Night Harbour' }));
  });

  it('shows the naming rule under the name once the field has been left', async () => {
    await renderThemed(
      <SeriesForm initial={EMPTY} submitLabel="Create series" onSubmit={jest.fn()} />,
    );

    await fireEvent.changeText(screen.getByLabelText('Series name'), 'x'.repeat(80));
    await fireEvent(screen.getByLabelText('Series name'), 'blur');

    expect(screen.queryByText('Keep the name under 80 characters.')).toBeNull();
    expect(screen.getByText('You can change this later.')).toBeOnTheScreen();
  });

  it('shows the language choices as rows, with Not set until one is picked', async () => {
    await renderThemed(
      <SeriesForm initial={EMPTY} submitLabel="Create series" onSubmit={jest.fn()} />,
    );

    expect(screen.getByRole('button', { name: /Original language/ })).toBeOnTheScreen();
    expect(screen.getAllByText('Not set')).toHaveLength(2);
  });
});

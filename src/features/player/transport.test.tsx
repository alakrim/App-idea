/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load the stand-ins with require() */
import { render, screen } from '@testing-library/react-native';

import { ThemeProvider } from '@/ui/theme';

import { Transport, type TransportProps } from './transport';

jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));

const props: TransportProps = {
  playing: true,
  busy: false,
  onTogglePlay: () => undefined,
  onSkip: () => undefined,
  onSentence: () => undefined,
};

async function renderTransport(overrides: Partial<TransportProps> = {}) {
  await render(
    <ThemeProvider initialMode="dark">
      <Transport {...props} {...overrides} />
    </ThemeProvider>,
  );
}

describe('Transport while narration is ahead of playback', () => {
  it('shows the calm "Narrating ahead" line, with the same accessible name', async () => {
    await renderTransport({ narratingAhead: true });

    expect(screen.getByLabelText('Narrating ahead…')).toBeTruthy();
    expect(screen.getByText('Narrating ahead…')).toBeTruthy();
  });

  it('keeps the play button a pause control, not a busy spinner, while it waits', async () => {
    await renderTransport({ playing: true, busy: true, narratingAhead: true });

    expect(screen.getByRole('button', { name: 'Pause' }).props.accessibilityState).toMatchObject({
      busy: false,
    });
  });

  it('shows no line when playback is not waiting on narration', async () => {
    await renderTransport();

    expect(screen.queryByLabelText('Narrating ahead…')).toBeNull();
  });
});

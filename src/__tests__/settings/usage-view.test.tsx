import { screen } from '@testing-library/react-native';

import { buildUsageSummary } from '@/features/settings/usage';
import { UsageView } from '@/features/settings/usage-view';

import { renderThemed } from '../helpers/render-themed';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));

const summary = buildUsageSummary({
  today: [{ key: 'gemini', label: 'Gemini 3.8 Flash Lite TTS', calls: 1, costUsd: 0.0005, unknownCalls: 0 }],
  week: [
    { key: 'gemini', label: 'Gemini 3.8 Flash Lite TTS', calls: 3, costUsd: 0.0015, unknownCalls: 0 },
    { key: 'haiku', label: 'Claude Haiku 5.5', calls: 2, costUsd: 0.5, unknownCalls: 0 },
  ],
  month: [
    { key: 'gemini', label: 'Gemini 3.8 Flash Lite TTS', calls: 3, costUsd: 0.0015, unknownCalls: 0 },
    { key: 'haiku', label: 'Claude Haiku 5.5', calls: 2, costUsd: 0.5, unknownCalls: 0 },
  ],
  byModel: [
    { key: 'gemini', label: 'Gemini 3.8 Flash Lite TTS', calls: 3, costUsd: 0.0015, unknownCalls: 0 },
    { key: 'haiku', label: 'Claude Haiku 5.5', calls: 2, costUsd: 0.5, unknownCalls: 0 },
  ],
  byStage: [{ key: 'translate', label: 'Translate', calls: 2, costUsd: 0.5, unknownCalls: 0 }],
});

describe('UsageView', () => {
  it('shows each window with its total and call count', async () => {
    await renderThemed(<UsageView summary={summary} />);

    expect(screen.getByLabelText('Today: $0.0005')).toBeOnTheScreen();
    expect(screen.getByText('3 calls', { exact: false })).toBeOnTheScreen();
    expect(screen.getByText('1 call')).toBeOnTheScreen();
  });

  it('breaks spend down by model and stage with each share of the total', async () => {
    await renderThemed(<UsageView summary={summary} />);

    expect(
      screen.getByLabelText('Claude Haiku 5.5: $0.50, 2 calls, 100 percent of spend'),
    ).toBeOnTheScreen();
    expect(
      screen.getByLabelText('Gemini 3.8 Flash Lite TTS: $0.0015, 3 calls, 0 percent of spend'),
    ).toBeOnTheScreen();
    expect(screen.getByText('By stage')).toBeOnTheScreen();
    expect(screen.getByText('Translate')).toBeOnTheScreen();
  });

  it('explains the empty state when nothing has been spent', async () => {
    const empty = buildUsageSummary({ today: [], week: [], month: [], byModel: [], byStage: [] });
    await renderThemed(<UsageView summary={empty} />);

    expect(screen.getByRole('header', { name: 'No spending yet' })).toBeOnTheScreen();
  });
});

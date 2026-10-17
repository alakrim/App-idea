import { fireEvent, screen } from '@testing-library/react-native';

import { ModelNotice } from '@/features/settings/model-notice';
import { buildPickerItems, ModelPicker } from '@/features/settings/model-picker';
import type { OpenRouterModel } from '@/services/openrouter';

import { renderThemed } from '../helpers/render-themed';

// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));

function model(id: string, name: string): OpenRouterModel {
  return {
    id,
    name,
    contextLength: 200_000,
    pricing: { prompt: 0.000001, completion: 0.000005 },
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: ['structured_outputs'],
    supportedVoices: [],
    createdAt: null,
  };
}

const HAIKU = model('anthropic/claude-haiku-5.5', 'Anthropic: Claude Haiku 5.5');
const NANO = model('openai/gpt-5-nano', 'OpenAI: GPT-5 Nano');
const LLAMA = model('meta-llama/llama-4', 'Meta: Llama 4');
const MODELS = [NANO, HAIKU, LLAMA];

describe('buildPickerItems', () => {
  it('puts the recommended model first, under its own heading', () => {
    const items = buildPickerItems(MODELS, '', HAIKU.id);
    expect(
      items.map((item) =>
        item.kind === 'header' ? item.title : item.kind === 'model' ? item.model.id : 'empty',
      ),
    ).toEqual([
      'Recommended',
      'anthropic/claude-haiku-5.5',
      'All models',
      'openai/gpt-5-nano',
      'meta-llama/llama-4',
    ]);
  });

  it('flattens matches into one results list while searching', () => {
    const items = buildPickerItems(MODELS, 'nano', HAIKU.id);
    expect(items).toEqual([
      { kind: 'header', key: 'header-all', title: 'Results' },
      expect.objectContaining({ kind: 'model', model: NANO }),
    ]);
  });

  it('matches by provider as well as name', () => {
    const items = buildPickerItems(MODELS, 'meta', null);
    expect(items.filter((item) => item.kind === 'model')).toHaveLength(1);
  });

  it('returns an empty state with the query when nothing matches', () => {
    expect(buildPickerItems(MODELS, 'zzz', HAIKU.id)).toEqual([
      { kind: 'empty', key: 'empty', query: 'zzz' },
    ]);
  });
});

describe('ModelPicker', () => {
  const describe_ = () => '200K context · $1.00 in · $5.00 out per 1M';

  it('filters as the user types and reports the chosen model', async () => {
    const onSelect = jest.fn();
    await renderThemed(
      <ModelPicker
        models={MODELS}
        selectedId={HAIKU.id}
        recommendedId={HAIKU.id}
        describe={describe_}
        onSelect={onSelect}
        searchLabel="Search translation models"
      />,
    );

    expect(screen.getByRole('radio', { name: /GPT-5 Nano/g })).toBeOnTheScreen();
    await fireEvent.changeText(screen.getByLabelText('Search translation models'), 'llama');

    expect(screen.queryByRole('radio', { name: /GPT-5 Nano/g })).toBeNull();
    await fireEvent.press(screen.getByRole('radio', { name: /Llama 4/ }));
    expect(onSelect).toHaveBeenCalledWith(LLAMA);
  });

  it('checks the selected model and labels the recommended one', async () => {
    await renderThemed(
      <ModelPicker
        models={MODELS}
        selectedId={HAIKU.id}
        recommendedId={HAIKU.id}
        describe={describe_}
        onSelect={jest.fn()}
        searchLabel="Search models"
      />,
    );

    expect(
      screen.getByRole('radio', { name: /Claude Haiku 5.5/, checked: true }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Recommended' })).toBeOnTheScreen();
    expect(screen.getAllByText('Recommended')).toHaveLength(2);
  });

  it('shows an empty state when no model matches', async () => {
    await renderThemed(
      <ModelPicker
        models={MODELS}
        selectedId={null}
        recommendedId={null}
        describe={describe_}
        onSelect={jest.fn()}
        searchLabel="Search models"
      />,
    );

    await fireEvent.changeText(screen.getByLabelText('Search models'), 'qwerty');

    expect(screen.getByText('No models match "qwerty". Try a shorter word.')).toBeOnTheScreen();
  });

  it('shows the warning notice for a saved model that disappeared', async () => {
    await renderThemed(
      <ModelPicker
        models={MODELS}
        selectedId={null}
        recommendedId={HAIKU.id}
        describe={describe_}
        onSelect={jest.fn()}
        searchLabel="Search models"
        header={
          <ModelNotice
            tone="warning"
            message="Your current model, vendor/gone, is no longer offered. Pick a replacement below."
          />
        }
      />,
    );

    expect(screen.getByText(/is no longer offered/)).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { checked: true })).toBeNull();
  });
});

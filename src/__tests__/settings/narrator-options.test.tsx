/* eslint-disable @typescript-eslint/no-require-imports -- mock factories require react and react-native lazily */
import { act, fireEvent, screen } from '@testing-library/react-native';

import { OpenRouterProvider } from '@/app-shell/openrouter-provider';
import { DEFAULT_NARRATION } from '@/core/defaults';
import { FREE_NARRATOR_MODEL_ID, KOKORO_MODEL_ID } from '@/core/narration/options';
import type { NarrationSettings } from '@/core/settings';
import type { CatalogState } from '@/features/settings/model-catalog';
import { NarratorOptionList } from '@/features/settings/narrator-option-list';
import {
  cachedPreview,
  hasPaidPreviewConsent,
  savePreview,
} from '@/features/settings/preview-cache';
import { createOpenRouterClient, type OpenRouterModel } from '@/services/openrouter';
import { useApiKeyStatus } from '@/services/secrets';

import { renderThemed } from '../helpers/render-themed';

jest.mock('react-native-reanimated', () => require('../helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ replace: jest.fn(), play: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false }),
}));
jest.mock('@/features/settings/preview-cache', () => ({
  cachedPreview: jest.fn(() => null),
  hasPaidPreviewConsent: jest.fn(() => false),
  recordPaidPreviewConsent: jest.fn(),
  savePreview: jest.fn(),
}));
jest.mock('@/services/secrets', () => ({
  getApiKey: jest.fn(() => Promise.resolve('sk-or-v1-TESTKEY')),
  useApiKeyStatus: jest.fn(() => 'missing'),
}));

// Prices are the live catalogue figures the architect recorded (ADR-0003, the L1 brief).
const GEMINI: OpenRouterModel = {
  id: 'google/gemini-3.8-flash-lite-tts',
  name: 'Google: Gemini 3.8 Flash Lite TTS',
  contextLength: 0,
  pricing: { prompt: 0.0000005, completion: 0.000006 },
  inputModalities: ['text'],
  outputModalities: ['speech'],
  supportedParameters: ['instructions'],
  supportedVoices: ['Zephyr', 'Puck', 'Kore'],
  createdAt: null,
};
const KOKORO: OpenRouterModel = {
  id: KOKORO_MODEL_ID,
  name: 'Hexgrad: Kokoro 82M',
  contextLength: 0,
  pricing: { prompt: 0.00000062, completion: 0 },
  inputModalities: ['text'],
  outputModalities: ['speech'],
  supportedParameters: [],
  supportedVoices: ['af_heart', 'if_sara', 'pf_dora'],
  createdAt: null,
};
const FREE: OpenRouterModel = {
  id: FREE_NARRATOR_MODEL_ID,
  name: 'Fish Audio: S2.1 Pro (free)',
  contextLength: 0,
  pricing: { prompt: 0, completion: 0 },
  inputModalities: ['text'],
  outputModalities: ['speech'],
  supportedParameters: [],
  supportedVoices: [],
  createdAt: null,
};

const LIVE: CatalogState = { status: 'live', models: [GEMINI, KOKORO, FREE] };
const NARRATION: NarrationSettings = { ...DEFAULT_NARRATION };

const mockStatus = jest.mocked(useApiKeyStatus);

async function renderList(props: {
  lang?: string;
  catalog?: CatalogState;
  onChoose?: (narration: NarrationSettings) => void;
  keyPresent?: boolean;
}) {
  mockStatus.mockReturnValue(props.keyPresent ? 'present' : 'missing');
  const client = createOpenRouterClient({
    getApiKey: async () => (props.keyPresent ? 'sk-or-v1-TESTKEY' : null),
    appUrl: 'https://lectio.app',
    appTitle: 'Lectio',
    fetchImpl: () => Promise.reject(new Error('no network in tests')),
  });
  const onChoose = props.onChoose ?? jest.fn();
  await renderThemed(
    <OpenRouterProvider client={client}>
      <NarratorOptionList
        narration={NARRATION}
        lang={props.lang ?? 'it'}
        catalog={props.catalog ?? LIVE}
        onChoose={onChoose}
      />
    </OpenRouterProvider>,
  );
  return { onChoose };
}

describe('narrator option cards', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(cachedPreview).mockReturnValue(null);
    jest.mocked(hasPaidPreviewConsent).mockReturnValue(false);
  });

  it('shows the three narrators with their live hourly prices', async () => {
    await renderList({});

    expect(
      screen.getByRole('radio', {
        name: 'Best quality narrator, Gemini 3.8 Flash Lite TTS, About $0.55 per hour',
      }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('radio', { name: 'Budget narrator, Kokoro 82M, About $0.03 per hour' }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /^Free narrator, .*, Free$/ })).toBeOnTheScreen();
    expect(screen.getAllByText('All languages')).toHaveLength(2);
    expect(
      screen.getByText(
        '8 languages: English, Spanish, French, Hindi, Italian, Japanese, Portuguese, Chinese',
      ),
    ).toBeOnTheScreen();
  });

  it('marks the saved narrator as checked', async () => {
    await renderList({});
    expect(
      screen.getByRole('radio', { name: /^Best quality narrator/, checked: true }),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('radio', { name: /^Budget narrator/, checked: false }),
    ).toBeOnTheScreen();
  });

  it('says what it is checking while the price loads, and why it has none offline', async () => {
    await renderList({ catalog: { status: 'loading' } });
    expect(screen.getAllByText('Checking the price…')).toHaveLength(3);
  });

  it('says the price is unavailable when the catalogue cannot load', async () => {
    await renderList({ catalog: { status: 'unavailable', message: 'offline' } });
    expect(screen.getAllByText('Price unavailable right now')).toHaveLength(3);
  });

  it('disables a narrator that does not speak the target language', async () => {
    await renderList({ lang: 'de' });

    expect(
      screen.getByRole('radio', {
        name: /^Budget narrator.*Not available for German/,
        disabled: true,
      }),
    ).toBeOnTheScreen();
    expect(screen.getByText('Not available for German')).toBeOnTheScreen();
    expect(
      screen.getByRole('radio', { name: /^Best quality narrator/, disabled: false }),
    ).toBeOnTheScreen();
  });

  it('saves Budget with its Italian voice when it is picked, and keeps the speed', async () => {
    const { onChoose } = await renderList({ lang: 'it' });

    await fireEvent.press(screen.getByRole('radio', { name: /^Budget narrator/ }));

    expect(onChoose).toHaveBeenCalledWith({
      provider: 'openrouter',
      model: KOKORO_MODEL_ID,
      voice: 'if_sara',
      style: null,
      speed: DEFAULT_NARRATION.speed,
    });
  });

  it('does not select a disabled narrator', async () => {
    const { onChoose } = await renderList({ lang: 'de' });

    await fireEvent.press(screen.getByRole('radio', { name: /^Budget narrator/ }));

    expect(onChoose).not.toHaveBeenCalled();
  });

  it('asks for a key before the sample can play', async () => {
    await renderList({ keyPresent: false });

    expect(screen.getAllByText('Connect OpenRouter to hear a sample.')).toHaveLength(3);
    expect(screen.queryByRole('button', { name: 'Preview' })).toBeNull();
  });

  it('offers a Preview on each card once a key is connected', async () => {
    await renderList({ keyPresent: true });

    expect(screen.getAllByRole('button', { name: 'Preview' })).toHaveLength(3);
  });

  it('asks once for consent before a new paid sample is made', async () => {
    await renderList({ keyPresent: true, lang: 'en' });

    await act(async () => {
      await fireEvent.press(screen.getAllByRole('button', { name: 'Preview' })[0]!);
    });

    expect(
      await screen.findByText(/Previews use your OpenRouter credits, about \$0\.00\d+ each/),
    ).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Play sample' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Not now' })).toBeOnTheScreen();
  });

  it('samples the free narrator without asking, because it costs nothing', async () => {
    await renderList({ keyPresent: true, lang: 'en' });

    await act(async () => {
      await fireEvent.press(screen.getAllByRole('button', { name: 'Preview' })[2]!);
    });

    expect(screen.queryByText(/Previews use your OpenRouter credits/)).toBeNull();
  });

  it('plays a cached sample without asking, and makes no new one', async () => {
    jest
      .mocked(cachedPreview)
      .mockReturnValue({ uri: 'file:///previews/sample.mp3' } as unknown as ReturnType<
        typeof cachedPreview
      >);
    await renderList({ keyPresent: true, lang: 'en' });

    await act(async () => {
      await fireEvent.press(screen.getAllByRole('button', { name: 'Preview' })[0]!);
    });

    expect(screen.queryByText(/Previews use your OpenRouter credits/)).toBeNull();
    expect(savePreview).not.toHaveBeenCalled();
  });
});

/* eslint-disable @typescript-eslint/no-require-imports -- mock factories require react and react-native lazily */
import { fireEvent, screen } from '@testing-library/react-native';

import { OpenRouterProvider } from '@/app-shell/openrouter-provider';
import { DEFAULT_NARRATION } from '@/core/defaults';
import { FREE_NARRATOR_MODEL_ID, KOKORO_MODEL_ID } from '@/core/narration/options';
import type { NarrationSettings } from '@/core/settings';
import type { CatalogState } from '@/features/settings/model-catalog';
import { NarrationPanel } from '@/features/settings/narration-settings';
import { createOpenRouterClient, type OpenRouterModel } from '@/services/openrouter';

import { renderThemed } from '../helpers/render-themed';

jest.mock('react-native-reanimated', () => require('../helpers/reanimated-stub'));
jest.mock('react-native-gesture-handler', () =>
  require('../../features/player/__fixtures__/gesture-stub'),
);
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn() }));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('expo-audio', () => ({
  useAudioPlayer: () => ({ replace: jest.fn(), play: jest.fn() }),
  useAudioPlayerStatus: () => ({ playing: false }),
}));
jest.mock('@/services/secrets', () => ({
  getApiKey: jest.fn(() => Promise.resolve(null)),
  useApiKeyStatus: jest.fn(() => 'missing'),
}));
jest.mock('@/features/settings/device-voices', () => ({
  loadDeviceVoices: jest.fn(() => Promise.resolve([])),
}));

const mockCatalog = jest.fn<CatalogState, []>();
jest.mock('@/features/settings/model-catalog', () => ({
  ...jest.requireActual('@/features/settings/model-catalog'),
  useModelCatalog: () => ({ state: mockCatalog(), reload: jest.fn() }),
}));

const mockSettings = { current: {} as Record<string, unknown> };
const mockPatch = jest.fn();
jest.mock('@/features/settings/settings-store', () => ({
  useSettings: () => ({ settings: mockSettings.current, patch: mockPatch }),
}));

// Live catalogue figures the architect recorded (ADR-0003, L1 brief).
const GEMINI: OpenRouterModel = {
  id: 'google/gemini-3.8-flash-lite-tts',
  name: 'Google: Gemini 3.8 Flash Lite TTS',
  contextLength: 0,
  pricing: { prompt: 0.0000005, completion: 0.000006 },
  inputModalities: ['text'],
  outputModalities: ['speech'],
  supportedParameters: ['instructions'],
  supportedVoices: ['Zephyr', 'Puck', 'Kore'],
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
};

function settingsWith(narration: NarrationSettings, targetLang: string | null = 'it') {
  mockSettings.current = {
    narration,
    uiLanguage: 'en',
    defaultTargetLang: targetLang,
    ambience: { enabled: true, levelDb: -22, duckingDb: 8 },
    reading: { fontScale: 1, showOriginal: false },
  };
}

async function renderPanel() {
  const client = createOpenRouterClient({
    getApiKey: async () => null,
    appUrl: 'https://lectio.app',
    appTitle: 'Lectio',
    fetchImpl: () => Promise.reject(new Error('no network in tests')),
  });
  await renderThemed(
    <OpenRouterProvider client={client}>
      <NarrationPanel />
    </OpenRouterProvider>,
  );
}

describe('narration settings panel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCatalog.mockReturnValue({ status: 'live', models: [GEMINI, KOKORO, FREE] });
  });

  it('lists the three narrators, then the device voice, then all speech models', async () => {
    settingsWith({ ...DEFAULT_NARRATION });
    await renderPanel();

    expect(
      screen.getByRole('radio', { name: /^Best quality narrator/, checked: true }),
    ).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: 'Device voice, free and offline' })).toBeOnTheScreen();
    expect(screen.getByText('All speech models')).toBeOnTheScreen();
  });

  it('offers only the Italian Kokoro voice for an Italian target', async () => {
    settingsWith({ ...DEFAULT_NARRATION, model: KOKORO_MODEL_ID, voice: 'if_sara', style: null });
    await renderPanel();

    expect(screen.getByRole('radio', { name: 'if_sara' })).toBeOnTheScreen();
    expect(screen.queryByRole('radio', { name: 'af_heart' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'pf_dora' })).toBeNull();
  });

  it('saves the choice of a narrator and its default voice', async () => {
    settingsWith({ ...DEFAULT_NARRATION });
    await renderPanel();

    await fireEvent.press(screen.getByRole('radio', { name: /^Budget narrator/ }));

    expect(mockPatch).toHaveBeenCalledWith({
      narration: expect.objectContaining({ model: KOKORO_MODEL_ID, voice: 'if_sara', style: null }),
    });
  });

  it('explains that the free narrator picks its own voice', async () => {
    settingsWith({ ...DEFAULT_NARRATION, model: FREE_NARRATOR_MODEL_ID, voice: '', style: null });
    await renderPanel();

    expect(
      screen.getByText('This narrator picks its own voice, so there is nothing to choose.'),
    ).toBeOnTheScreen();
    expect(screen.getByRole('radio', { name: /^Free narrator/, checked: true })).toBeOnTheScreen();
  });

  it('says the voices are loading, not missing, while the catalogue is in flight', async () => {
    mockCatalog.mockReturnValue({ status: 'loading' });
    settingsWith({ ...DEFAULT_NARRATION });
    await renderPanel();

    expect(screen.getByText('Loading the voices…')).toBeOnTheScreen();
  });
});

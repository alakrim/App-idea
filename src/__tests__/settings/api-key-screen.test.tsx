/* eslint-disable @typescript-eslint/no-require-imports -- mock factories require react and react-native lazily */
import { act, fireEvent, screen } from '@testing-library/react-native';

import { getApiKey, setApiKey, useApiKeyStatus } from '@/services/secrets';

import ApiKeyScreen from '../../../app/settings/api-key';
import { renderThemed } from '../helpers/render-themed';

 
jest.mock('react-native-reanimated', () => require('../helpers/reanimated-stub'));
jest.mock('@/ui/icons', () => new Proxy({}, { get: () => () => null }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
}));
jest.mock('expo-clipboard', () => ({ getStringAsync: jest.fn(() => Promise.resolve('')) }));
jest.mock('expo-haptics', () => ({
  notificationAsync: jest.fn(() => Promise.resolve()),
  NotificationFeedbackType: { Success: 'success' },
  selectionAsync: jest.fn(() => Promise.resolve()),
  impactAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: { Light: 'light' },
}));
jest.mock('react-native-safe-area-context', () => {
  const { createElement } = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaView: ({ children, style }: { children: unknown; style: unknown }) =>
      createElement(View, { style }, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('@/services/secrets', () => ({
  isWellFormedApiKey: (key: string) => key.startsWith('sk-or-') && key.length >= 20,
  getApiKey: jest.fn(),
  setApiKey: jest.fn(),
  clearApiKey: jest.fn(),
  useApiKeyStatus: jest.fn(),
}));
jest.mock('@/features/settings/key-check', () => ({
  checkCandidateKey: (key: string) => mockCheck(key),
}));
jest.mock('@/app-shell/openrouter-provider', () => ({
  useOpenRouter: () => mockClient,
}));

const FULL_KEY = 'sk-or-v1-0123456789abcdefSECRETTAIL9f3a';
const mockCheck = jest.fn();
const mockClient = { validateKey: jest.fn() };

const ACCOUNT = {
  valid: true,
  label: 'sk-or-v1-…9f3a',
  usage: 1.2345,
  limit: null,
  limitRemaining: null,
  isFreeTier: false,
} as const;

describe('API key screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(getApiKey).mockResolvedValue(FULL_KEY);
    jest.mocked(useApiKeyStatus).mockReturnValue('present');
    mockClient.validateKey.mockResolvedValue(ACCOUNT);
  });

  it('shows a saved key only as its masked form with the last four characters', async () => {
    const view = await renderThemed(<ApiKeyScreen />);

    expect(await screen.findByText('sk-or-••••9f3a')).toBeOnTheScreen();
    expect(JSON.stringify(view.toJSON())).not.toContain(FULL_KEY);
    expect(JSON.stringify(view.toJSON())).not.toContain('0123456789abcdef');
  });

  it('reports the account from OpenRouter without the key', async () => {
    await renderThemed(<ApiKeyScreen />);

    expect(await screen.findByText('$1.23 used so far on this key')).toBeOnTheScreen();
    expect(screen.getByText('No spending limit set')).toBeOnTheScreen();
  });

  it('replaces a key only after the new one is checked, and never shows it afterwards', async () => {
    const NEW_KEY = 'sk-or-v1-NEWKEY0000000000000000replacement';
    mockCheck.mockResolvedValue(ACCOUNT);
    jest.mocked(setApiKey).mockResolvedValue(undefined);
    const view = await renderThemed(<ApiKeyScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Replace key' }));
    await fireEvent.changeText(screen.getByLabelText('OpenRouter key'), NEW_KEY);
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Replace key' }));
    });

    expect(mockCheck).toHaveBeenCalledWith(NEW_KEY);
    expect(setApiKey).toHaveBeenCalledWith(NEW_KEY);
    expect(JSON.stringify(view.toJSON())).not.toContain('NEWKEY0000');
  });

  it('keeps the saved key when a replacement is rejected', async () => {
    mockCheck.mockResolvedValue({
      valid: false,
      error: { code: 'AUTH', message: 'rejected', retryable: false },
    });
    await renderThemed(<ApiKeyScreen />);

    await fireEvent.press(await screen.findByRole('button', { name: 'Replace key' }));
    await fireEvent.changeText(
      screen.getByLabelText('OpenRouter key'),
      'sk-or-v1-badbadbadbadbadbadbad',
    );
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Replace key' }));
    });

    expect(await screen.findByText(/did not accept this key/)).toBeOnTheScreen();
    expect(setApiKey).not.toHaveBeenCalled();
  });
});

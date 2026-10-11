/* eslint-disable @typescript-eslint/no-require-imports -- mock factories require react and react-native lazily */
import { act, fireEvent, screen } from '@testing-library/react-native';

import { OnboardingFlow } from '@/features/settings/onboarding/onboarding-flow';
import { setApiKey } from '@/services/secrets';

import { renderThemed } from '../helpers/render-themed';

 
jest.mock('react-native-reanimated', () => require('../helpers/reanimated-stub'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
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
  setApiKey: jest.fn(),
  getApiKey: jest.fn(),
  clearApiKey: jest.fn(),
  useApiKeyStatus: jest.fn(() => 'missing'),
}));
jest.mock('@/features/settings/key-check', () => ({
  checkCandidateKey: (key: string) => mockCheck(key),
}));
jest.mock('@/features/settings/settings-store', () => ({
  useSettings: () => ({ settings: mockSettings, patch: mockPatch }),
}));

const VALID_KEY = 'sk-or-v1-0123456789abcdefghijkl';
const mockCheck = jest.fn();
const mockPatch = jest.fn();
const mockSettings = { onboardingDone: false, contentNoticeAccepted: false };

const VALID_ACCOUNT = {
  valid: true,
  label: 'sk-or-v1-…ijkl',
  usage: 0,
  limit: 10,
  limitRemaining: 8.5,
  isFreeTier: false,
} as const;

async function renderFlow() {
  const onFinish = jest.fn();
  const view = await renderThemed(<OnboardingFlow onFinish={onFinish} />);
  return { view, onFinish };
}

describe('onboarding flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('walks through value, key and notice, then saves onboarding as done', async () => {
    const { onFinish } = await renderFlow();

    expect(screen.getByRole('header', { name: 'Any page, read to you.' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('header', { name: 'Connect OpenRouter' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Skip for now' }));

    expect(await screen.findByRole('header', { name: 'Before you import' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'I understand' }));

    expect(mockPatch).toHaveBeenCalledWith({ contentNoticeAccepted: true, onboardingDone: true });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('checks a pasted key, saves it, and shows the account without echoing the key', async () => {
    mockCheck.mockResolvedValue(VALID_ACCOUNT);
    jest.mocked(setApiKey).mockResolvedValue(undefined);
    const { view } = await renderFlow();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('header', { name: 'Connect OpenRouter' });

    await fireEvent.changeText(screen.getByLabelText('OpenRouter key'), `  ${VALID_KEY}  `);
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Check and save' }));
    });

    expect(mockCheck).toHaveBeenCalledWith(VALID_KEY);
    expect(setApiKey).toHaveBeenCalledWith(VALID_KEY);
    expect(await screen.findByText('Connected')).toBeOnTheScreen();
    expect(screen.getByText('$8.50 left under your spending limit')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeOnTheScreen();
    expect(JSON.stringify(view.toJSON())).not.toContain('0123456789abcdef');
  });

  it('explains an authentication failure and saves nothing', async () => {
    mockCheck.mockResolvedValue({
      valid: false,
      error: { code: 'AUTH', message: 'rejected', retryable: false },
    });
    await renderFlow();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('header', { name: 'Connect OpenRouter' });

    await fireEvent.changeText(screen.getByLabelText('OpenRouter key'), VALID_KEY);
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Check and save' }));
    });

    expect(await screen.findByText(/OpenRouter did not accept this key/)).toBeOnTheScreen();
    expect(setApiKey).not.toHaveBeenCalled();
  });

  it('explains a network failure as recoverable', async () => {
    mockCheck.mockResolvedValue({
      valid: false,
      error: { code: 'NETWORK', message: 'timeout', retryable: true },
    });
    await renderFlow();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('header', { name: 'Connect OpenRouter' });

    await fireEvent.changeText(screen.getByLabelText('OpenRouter key'), VALID_KEY);
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Check and save' }));
    });

    expect(await screen.findByText(/No answer from OpenRouter/)).toBeOnTheScreen();
    expect(mockCheck).toHaveBeenCalledTimes(1);
  });

  it('rejects text that is not shaped like a key before any network call', async () => {
    await renderFlow();
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }));
    await screen.findByRole('header', { name: 'Connect OpenRouter' });

    await fireEvent.changeText(screen.getByLabelText('OpenRouter key'), 'hello there');
    await act(async () => {
      await fireEvent.press(screen.getByRole('button', { name: 'Check and save' }));
    });

    expect(await screen.findByText(/does not look like an OpenRouter key/)).toBeOnTheScreen();
    expect(mockCheck).not.toHaveBeenCalled();
  });
});

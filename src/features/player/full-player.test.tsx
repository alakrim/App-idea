/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load the stand-ins with require() */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { VocabActionsProvider } from '@/features/vocab/vocab-provider';
import type { VocabActions } from '@/features/vocab/vocab-actions';
import { ThemeProvider } from '@/ui/theme';
import { ToastProvider } from '@/ui/toast';

import { fixtureChapter, id, setupController } from './__fixtures__/playback-fixtures';
import { FullPlayer } from './full-player';
import { PlaybackProvider } from './player-provider';

import type { ReactElement } from 'react';

// Jest cannot load Reanimated's worklet runtime or gesture-handler's native detectors, and the
// bottom sheet needs both. The stand-ins keep the behaviour the tests check.
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('react-native-gesture-handler', () => require('./__fixtures__/gesture-stub'));
jest.mock('@gorhom/bottom-sheet', () => require('./__fixtures__/bottom-sheet-stub'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
// The vocab provider reads the database and OpenRouter before it uses the injected actions.
jest.mock('@/db/hooks', () => ({ useDb: () => ({}) }));
jest.mock('@/app-shell/openrouter-provider', () => ({ useOpenRouter: () => ({}) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn(), replace: jest.fn() },
  Stack: { Screen: () => null },
}));

const flush = () => act(async () => new Promise<void>((resolve) => setImmediate(resolve)));

const PHONE_FRAME = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

/** Theme, safe area (as on a phone with no notch) and toasts, outermost first. */
async function renderPhone(ui: ReactElement, vocab: VocabActions = fakeVocabActions({})) {
  return await render(
    <ThemeProvider initialMode="dark">
      <SafeAreaProvider initialMetrics={PHONE_FRAME}>
        <ToastProvider>
          <VocabActionsProvider actions={vocab}>{ui}</VocabActionsProvider>
        </ToastProvider>
      </SafeAreaProvider>
    </ThemeProvider>,
  );
}

/** Renders the player on a fixture series. With chapters, the first one is loaded, as a tap would. */
async function renderPlayer(chapters = [fixtureChapter(1, 1, 'ready')]) {
  const setup = setupController(chapters);
  if (chapters.length > 0)
    await act(async () => {
      await setup.controller.playChapter(id(1));
    });
  await renderPhone(
    <PlaybackProvider controller={setup.controller}>
      <FullPlayer />
    </PlaybackProvider>,
  );
  return setup;
}

describe('FullPlayer states', () => {
  it('shows the empty state with a way back to the Library when nothing is loaded', async () => {
    await renderPlayer([]);

    expect(screen.getByRole('header', { name: 'Nothing playing' })).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Go to Library' }));
    expect(router.navigate).toHaveBeenCalledWith('/');
  });

  it('says a chapter has no narration yet instead of showing an empty player', async () => {
    const setup = setupController([fixtureChapter(1, 1, 'ready', [])]);
    await act(async () => {
      await setup.controller.playChapter(id(1));
    });
    await renderPhone(
      <PlaybackProvider controller={setup.controller}>
        <FullPlayer />
      </PlaybackProvider>,
    );

    expect(screen.getByRole('header', { name: 'Not narrated yet' })).toBeOnTheScreen();
  });

  it('offers a retry when the chapter failed to start, and retries it', async () => {
    const { controller } = await renderPlayer();
    const play = jest.spyOn(controller, 'playChapter');
    await act(async () => {
      controller.content.setState({ status: 'error', chapterId: id(1) });
    });

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(play).toHaveBeenCalledWith(id(1));
  });
});

describe('FullPlayer loaded', () => {
  it('shows the chapter, its series, the speed and a scrubber with its position', async () => {
    await renderPlayer();

    expect(screen.getByText('Chapter 1')).toBeOnTheScreen();
    expect(screen.getByText('The Night Harbour')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Speed 1.0×' })).toBeOnTheScreen();
    expect(
      screen.getByRole('adjustable', { name: 'Chapter position' }).props.accessibilityValue,
    ).toMatchObject({
      text: '0 seconds of 10 seconds',
    });
  });

  it('steps the scrubber by 15 seconds with its accessibility actions', async () => {
    const { controller } = await renderPlayer();
    const scrubber = screen.getByRole('adjustable', { name: 'Chapter position' });

    await fireEvent(scrubber, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await flush();
    expect(controller.player.getState().positionMs).toBe(10_000);

    await fireEvent(scrubber, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    await flush();
    expect(controller.player.getState().positionMs).toBe(0);
  });

  it('plays and pauses from the transport, and skips with its buttons', async () => {
    const { controller } = await renderPlayer();

    await fireEvent.press(screen.getByRole('button', { name: 'Play' }));
    await flush();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Forward 30 seconds' }));
    await flush();
    expect(controller.player.getState().positionMs).toBe(10_000);
  });

  it('moves one sentence when a skip button is held', async () => {
    const { controller } = await renderPlayer();

    await fireEvent(screen.getByRole('button', { name: 'Forward 30 seconds' }), 'longPress');
    await flush();

    expect(controller.player.getState().sentenceIdx).toBe(1);
    expect(controller.player.getState().positionMs).toBe(2000);
  });

  it('sets the speed from the speed sheet', async () => {
    const { controller } = await renderPlayer();

    await fireEvent.press(screen.getByRole('button', { name: 'Speed 1.0×' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Speed 1.25×' }));
    await flush();

    expect(controller.player.getState().rate).toBe(1.25);
  });

  it('shows the sleep countdown and counts it down', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-11T10:00:00Z') });
    try {
      const { controller } = await renderPlayer();
      await fireEvent.press(screen.getByRole('button', { name: 'Sleep timer, off' }));
      await fireEvent.press(screen.getByRole('button', { name: '15 minutes' }));
      expect(controller.player.getState().sleepTimer.mode).toBe('minutes');
      expect(screen.getByText('Sleep in 15:00')).toBeOnTheScreen();

      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });

      expect(screen.getByText('Sleep in 14:00')).toBeOnTheScreen();
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows the ambience that sounds here and turns it off from its sheet', async () => {
    await renderPlayer();

    expect(screen.getByText('Harbor')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: /Ambience, Harbor/ }));
    await fireEvent(screen.getByRole('switch', { name: 'Ambience on' }), 'valueChange', false);
    await flush();

    expect(screen.getByText('Ambience off')).toBeOnTheScreen();
  });
});

describe('FullPlayer learner actions', () => {
  it('repeats a held sentence and shows that the repeat is on', async () => {
    const { controller } = await renderPlayer();
    await fireEvent.press(screen.getAllByRole('button', { name: 'Open text' })[0] as never);
    await fireEvent(screen.getByText('Sentence 1 of chapter 1.'), 'longPress');

    await fireEvent.press(screen.getByRole('button', { name: 'Repeat sentence' }));
    await flush();

    expect(controller.content.getState().loopSentenceIdx).toBe(1);
    expect(screen.getByRole('button', { name: 'Repeat sentence' })).toBeOnTheScreen();
  });

  it('saves a held sentence to Vocab through the provider, and confirms the save', async () => {
    const saveToVocab = jest.fn(() => 'vocab-1');
    const actions = fakeVocabActions({ saveToVocab });
    const { controller } = setupController([fixtureChapter(1, 1, 'ready')]);
    await act(async () => {
      await controller.playChapter(id(1));
    });
    await renderPhone(
      <PlaybackProvider controller={controller}>
        <FullPlayer />
      </PlaybackProvider>,
      actions,
    );
    await fireEvent.press(screen.getAllByRole('button', { name: 'Open text' })[0] as never);
    await fireEvent(screen.getByText('Sentence 1 of chapter 1.'), 'longPress');

    await fireEvent.press(screen.getByRole('button', { name: 'Save to Vocab' }));

    expect(saveToVocab).toHaveBeenCalledWith({
      seriesId: controller.content.getState().seriesId,
      chapterId: id(1),
      sentenceIdx: 1,
      text: 'Sentence 1 of chapter 1.',
    });
    expect(screen.getByText('Saved to Vocab')).toBeOnTheScreen();
  });

  it('does not confirm a save that failed', async () => {
    const actions = fakeVocabActions({
      saveToVocab: jest.fn(() => {
        throw new Error('Select a word or phrase to save.');
      }),
    });
    const { controller } = setupController([fixtureChapter(1, 1, 'ready')]);
    await act(async () => {
      await controller.playChapter(id(1));
    });
    await renderPhone(
      <PlaybackProvider controller={controller}>
        <FullPlayer />
      </PlaybackProvider>,
      actions,
    );
    await fireEvent.press(screen.getAllByRole('button', { name: 'Open text' })[0] as never);
    await fireEvent(screen.getByText('Sentence 1 of chapter 1.'), 'longPress');

    await fireEvent.press(screen.getByRole('button', { name: 'Save to Vocab' }));

    expect(screen.queryByText('Saved to Vocab')).toBeNull();
    expect(screen.getByText('Nothing to save in this sentence')).toBeOnTheScreen();
  });
});

/** Vocab actions with every method stubbed. The provider takes them through its test seam. */
function fakeVocabActions(overrides: Partial<VocabActions>): VocabActions {
  return {
    saveToVocab: jest.fn(() => 'vocab-1'),
    retryExplanation: jest.fn(),
    isPending: () => false,
    failureOf: () => null,
    getVersion: () => 0,
    subscribe: () => () => undefined,
    ...overrides,
  };
}

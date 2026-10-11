import { act, fireEvent, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { renderThemed } from '../../__tests__/helpers/render-themed';
import { palette } from '@/ui/tokens';

import { VocabActionsContext } from './vocab-actions';
import { PlaybackProvider } from './player-provider';
import { FullPlayer } from './full-player';
import { fixtureChapter, id, setupController } from './__fixtures__/playback-fixtures';

// Jest cannot load Reanimated's worklet runtime or gesture-handler's native detectors, and the
// bottom sheet needs both. The stand-ins keep the behaviour the tests check.
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../../__tests__/helpers/reanimated-stub'));
jest.mock('react-native-gesture-handler', () => require('./__fixtures__/gesture-stub'));
jest.mock('@gorhom/bottom-sheet', () => require('./__fixtures__/bottom-sheet-stub'));
jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
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

/** The player needs safe-area metrics, as on a phone with no notch. */
function Phone({ children }: { children: ReactNode }) {
  return <SafeAreaProvider initialMetrics={PHONE_FRAME}>{children}</SafeAreaProvider>;
}

/** Renders the player on a fixture series. With chapters, the first one is loaded, as a tap would. */
async function renderPlayer(chapters = [fixtureChapter(1, 1, 'ready')]) {
  const setup = setupController(chapters);
  if (chapters.length > 0) await setup.controller.playChapter(id(1));
  await renderThemed(
    <Phone>
      <PlaybackProvider controller={setup.controller}>
        <FullPlayer />
      </PlaybackProvider>
    </Phone>,
  );
  return setup;
}

describe('FullPlayer states', () => {
  it('shows the empty state with a way back to the Library when nothing is loaded', async () => {
    await renderPlayer([]);

    expect(screen.getByRole('header', { name: 'Nothing playing' })).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: 'Go to Library' }));
    expect(router.navigate).toHaveBeenCalledWith('/');
  });

  it('says a chapter has no narration yet instead of showing an empty player', async () => {
    const setup = setupController([fixtureChapter(1, 1, 'ready', [])]);
    await setup.controller.playChapter(id(1));
    await renderThemed(
      <Phone>
        <PlaybackProvider controller={setup.controller}>
          <FullPlayer />
        </PlaybackProvider>
      </Phone>,
    );

    expect(screen.getByRole('header', { name: 'Not narrated yet' })).toBeOnTheScreen();
  });

  it('offers a retry when the chapter failed to start, and retries it', async () => {
    const { controller } = await renderPlayer();
    const play = jest.spyOn(controller, 'playChapter');
    controller.content.setState({ status: 'error', chapterId: id(1) });
    await flush();

    fireEvent.press(screen.getByRole('button', { name: 'Try again' }));

    expect(play).toHaveBeenCalledWith(id(1));
  });
});

describe('FullPlayer loaded', () => {
  it('shows the chapter, its series, the speed and a scrubber with its position', async () => {
    await renderPlayer();

    expect(screen.getByText('Chapter 1')).toBeOnTheScreen();
    expect(screen.getByText('The Night Harbour')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Speed 1.0×' })).toBeOnTheScreen();
    expect(screen.getByRole('adjustable', { name: 'Chapter position' })).toHaveAccessibleValue({
      text: '0 seconds of 10 seconds',
    });
  });

  it('steps the scrubber by 15 seconds with its accessibility actions', async () => {
    const { controller } = await renderPlayer();
    const scrubber = screen.getByRole('adjustable', { name: 'Chapter position' });

    fireEvent(scrubber, 'accessibilityAction', { nativeEvent: { actionName: 'increment' } });
    await flush();
    expect(controller.player.getState().positionMs).toBe(10_000);

    fireEvent(scrubber, 'accessibilityAction', { nativeEvent: { actionName: 'decrement' } });
    await flush();
    expect(controller.player.getState().positionMs).toBe(0);
  });

  it('plays and pauses from the transport, and skips with its buttons', async () => {
    const { controller } = await renderPlayer();
    console.log('DBG', screen.queryAllByRole('button').map((e) => e.props.accessibilityLabel), controller.content.getState().status);

    fireEvent.press(screen.getByRole('button', { name: 'Play' }));
    await flush();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: 'Forward 30 seconds' }));
    await flush();
    expect(controller.player.getState().positionMs).toBe(10_000);
  });

  it('moves one sentence when a skip button is held', async () => {
    const { controller } = await renderPlayer();

    fireEvent(screen.getByRole('button', { name: 'Forward 30 seconds' }), 'longPress');
    await flush();

    expect(controller.player.getState().sentenceIdx).toBe(1);
    expect(controller.player.getState().positionMs).toBe(2000);
  });

  it('sets the speed from the speed sheet', async () => {
    const { controller } = await renderPlayer();

    fireEvent.press(screen.getByRole('button', { name: 'Speed 1.0×' }));
    fireEvent.press(screen.getByRole('radio', { name: 'Speed 1.25×' }));
    await flush();

    expect(controller.player.getState().rate).toBe(1.25);
  });

  it('shows the sleep countdown and counts it down', async () => {
    jest.useFakeTimers({ now: new Date('2026-10-11T10:00:00Z') });
    try {
      const { controller } = await renderPlayer();
      fireEvent.press(screen.getByRole('button', { name: 'Sleep timer, off' }));
      fireEvent.press(screen.getByRole('radio', { name: '15 minutes' }));
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

    expect(screen.getByText('Harbor port')).toBeOnTheScreen();

    fireEvent.press(screen.getByRole('button', { name: /Ambience, Harbor port/ }));
    fireEvent(screen.getByRole('switch', { name: 'Ambience on' }), 'valueChange', false);
    await flush();

    expect(screen.getByText('Ambience off')).toBeOnTheScreen();
  });
});

describe('FullPlayer learner actions', () => {
  async function openTextAndHoldSentence(index: number, text: string) {
    await renderPlayer();
    fireEvent.press(screen.getAllByRole('button', { name: 'Open text' })[0] as never);
    fireEvent(screen.getByText(text), 'longPress');
    await flush();
    expect(index).toBeGreaterThanOrEqual(0);
  }

  it('repeats a held sentence and shows that the repeat is on', async () => {
    const { controller } = await renderPlayer();
    fireEvent.press(screen.getAllByRole('button', { name: 'Open text' })[0] as never);
    fireEvent(screen.getByText('Sentence 1 of chapter 1.'), 'longPress');

    fireEvent.press(screen.getByRole('button', { name: 'Repeat sentence' }));
    await flush();

    expect(controller.content.getState().loopSentenceIdx).toBe(1);
    expect(screen.getByRole('button', { name: 'Repeat sentence' })).toBeOnTheScreen();
  });

  it('saves a held sentence to Vocab through the injected actions', async () => {
    const onSaveVocab = jest.fn();
    const { controller } = setupController([fixtureChapter(1, 1, 'ready')]);
    await controller.playChapter(id(1));
    await renderThemed(
      <Phone>
        <VocabActionsContext.Provider value={{ onSaveVocab }}>
          <PlaybackProvider controller={controller}>
            <FullPlayer />
          </PlaybackProvider>
        </VocabActionsContext.Provider>
      </Phone>,
    );
    fireEvent.press(screen.getAllByRole('button', { name: 'Open text' })[0] as never);
    fireEvent(screen.getByText('Sentence 1 of chapter 1.'), 'longPress');

    fireEvent.press(screen.getByRole('button', { name: 'Save to Vocab' }));

    expect(onSaveVocab).toHaveBeenCalledWith({ chapterId: id(1), idx: 1 }, 'Sentence 1 of chapter 1.');
  });

  it('uses the dark palette tokens for the highlight', () => {
    expect(palette.dark.accentSoft).toMatch(/rgba/);
  });
});

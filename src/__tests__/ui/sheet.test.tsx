/* eslint-disable @typescript-eslint/no-require-imports -- jest.mock factories load the stub with require() */
import { act, screen } from '@testing-library/react-native';
import { AccessibilityInfo, BackHandler, Text as RNText } from 'react-native';

import { Sheet, SheetList } from '@/ui/sheet';
import { ThemeProvider } from '@/ui/theme';
import { ToastProvider } from '@/ui/toast';

import { renderThemed } from '../helpers/render-themed';

import type { ReactElement } from 'react';

// The real sheet needs a gesture root and Reanimated's worklet runtime. The stub renders children
// only while the sheet is open, the way the real one does, and forwards View props so tests can
// check the accessibility flags.

jest.mock('@gorhom/bottom-sheet', () => {
  const React = require('react');
  const RN = require('react-native');
  const BottomSheet = ({ index = -1, children }: { index?: number; children?: unknown }) =>
    index >= 0 ? React.createElement(RN.View, { testID: 'bottom-sheet' }, children) : null;
  return {
    __esModule: true,
    default: BottomSheet,
    BottomSheetBackdrop: () => null,
    BottomSheetView: (props: object) => React.createElement(RN.View, props),
    BottomSheetScrollView: (props: object) => React.createElement(RN.ScrollView, props),
    BottomSheetFlatList: (props: object) => React.createElement(RN.FlatList, props),
  };
});
// The test renderer has no native tree, so findNodeHandle would return null. A fixed tag lets the
// focus call be asserted. Only the renderer proxy is replaced, not the whole react-native module.
const FOCUS_TAG = 42;
const RENDERER_PROXY = 'react-native/Libraries/ReactNative/RendererProxy';
jest.mock(RENDERER_PROXY, () => ({
  ...jest.requireActual(RENDERER_PROXY),
  findNodeHandle: () => FOCUS_TAG,
}));
jest.mock('react-native-reanimated', () => require('../helpers/reanimated-stub'));

async function openSheet(onClose = jest.fn()) {
  await renderThemed(
    <Sheet visible onClose={onClose} title="Language">
      <RNText>Body</RNText>
    </Sheet>,
  );
  return onClose;
}

function themed(ui: ReactElement) {
  return (
    <ThemeProvider initialMode="dark">
      <ToastProvider>{ui}</ToastProvider>
    </ThemeProvider>
  );
}

describe('Sheet: Android back', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('closes an open sheet and consumes the back press', async () => {
    const subscribe = jest.spyOn(BackHandler, 'addEventListener');
    const onClose = await openSheet();

    const handler = subscribe.mock.calls.find(([name]) => name === 'hardwareBackPress')?.[1];
    expect(handler).toBeDefined();
    const handled = handler?.({ preventDefault: jest.fn() } as never);

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(handled).toBe(true);
  });

  it('does not intercept back while the sheet is closed', async () => {
    const subscribe = jest.spyOn(BackHandler, 'addEventListener');
    subscribe.mockClear();
    await renderThemed(
      <Sheet visible={false} onClose={jest.fn()} title="Language">
        <RNText>Body</RNText>
      </Sheet>,
    );

    expect(subscribe).not.toHaveBeenCalledWith('hardwareBackPress', expect.anything());
  });

  it('removes its back listener when the sheet closes', async () => {
    const remove = jest.fn();
    jest.spyOn(BackHandler, 'addEventListener').mockReturnValue({ remove });
    const { rerender } = await renderThemed(
      <Sheet visible onClose={jest.fn()} title="Language">
        <RNText>Body</RNText>
      </Sheet>,
    );
    expect(remove).not.toHaveBeenCalled();

    await act(async () => {
      rerender(
        themed(
          <Sheet visible={false} onClose={jest.fn()} title="Language">
            <RNText>Body</RNText>
          </Sheet>,
        ),
      );
    });

    expect(remove).toHaveBeenCalledTimes(1);
  });
});

describe('Sheet: accessibility', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('marks the open sheet as a modal for assistive tech', async () => {
    await openSheet();

    expect(screen.getByTestId('sheet-body')).toHaveProp('accessibilityViewIsModal', true);
  });

  it('exposes the title as a header', async () => {
    await openSheet();

    expect(screen.getByRole('header', { name: 'Language' })).toBeOnTheScreen();
  });

  it('moves screen-reader focus to the title when it opens', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
    await openSheet();

    expect(focus).toHaveBeenCalledWith(FOCUS_TAG);
  });

  it('does not move focus while the sheet is closed', async () => {
    const focus = jest.spyOn(AccessibilityInfo, 'setAccessibilityFocus');
    focus.mockClear();
    await renderThemed(
      <Sheet visible={false} onClose={jest.fn()} title="Language">
        <RNText>Body</RNText>
      </Sheet>,
    );

    expect(focus).not.toHaveBeenCalled();
  });
});

describe('SheetList', () => {
  it('renders every item inside the sheet', async () => {
    await renderThemed(
      <Sheet visible onClose={jest.fn()} title="Language">
        <SheetList
          data={['en', 'ja', 'fr']}
          keyExtractor={(code) => code}
          renderItem={({ item }) => <RNText>{item}</RNText>}
        />
      </Sheet>,
    );

    expect(screen.getByText('en')).toBeOnTheScreen();
    expect(screen.getByText('ja')).toBeOnTheScreen();
    expect(screen.getByText('fr')).toBeOnTheScreen();
  });
});

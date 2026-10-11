import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { CoverImage } from '@/ui/cover-image';
import { Text, hasRenderableFontSize } from '@/ui/text';

import { renderThemed } from '../helpers/render-themed';

// Regression for the device crash "FontSize should be a positive value. Current value: 0"
// (Samsung S24 Ultra, Android 15): Android's text layout throws for a font size of 0 or less.

// Jest cannot load Reanimated 4's worklets runtime (same stub as the other UI tests).
// eslint-disable-next-line @typescript-eslint/no-require-imports
jest.mock('react-native-reanimated', () => require('../helpers/reanimated-stub'));
jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children?: unknown }) => children,
}));
jest.mock('expo-image', () => ({ Image: () => null }));

type Tree = Awaited<ReturnType<typeof renderThemed>>['container'];

/** Every font size the rendered tree hands to a native (host) Text. */
function renderedFontSizes(tree: Tree): number[] {
  return tree
    .queryAll((node) => node.type === 'Text')
    .map((node) => {
      const style = StyleSheet.flatten(node.props.style as never) as
        { fontSize?: number } | undefined;
      return style?.fontSize ?? Number.NaN;
    });
}

describe('Text font size guard', () => {
  it('renders nothing for a font size Android cannot lay out', async () => {
    await renderThemed(
      <>
        <Text style={{ fontSize: 0 }}>zero</Text>
        <Text style={{ fontSize: -4 }}>negative</Text>
        <Text style={{ fontSize: Number.NaN }}>nan</Text>
        <Text>default</Text>
      </>,
    );

    expect(screen.queryByText('zero')).toBeNull();
    expect(screen.queryByText('negative')).toBeNull();
    expect(screen.queryByText('nan')).toBeNull();
    expect(screen.getByText('default')).toBeOnTheScreen();
  });

  it('accepts a missing or positive font size', () => {
    expect(hasRenderableFontSize(undefined)).toBe(true);
    expect(hasRenderableFontSize({ fontSize: 12 })).toBe(true);
    expect(hasRenderableFontSize([{ fontSize: 12 }, { fontSize: 0 }])).toBe(false);
  });
});

describe('CoverImage monogram', () => {
  it('never sends a zero font size before layout, and shows the letter once it has a width', async () => {
    const { container } = await renderThemed(
      <CoverImage uri={null} title="Night Harbour" testID="cover" />,
    );

    // Before layout: no text at all, so nothing with size 0 reaches Android.
    expect(renderedFontSizes(container)).toEqual([]);

    const box = container.queryAll((node) => typeof node.props.onLayout === 'function')[0];
    await fireEvent(box!, 'layout', {
      nativeEvent: { layout: { width: 120, height: 180, x: 0, y: 0 } },
    });

    expect(screen.getByText('N', { includeHiddenElements: true })).toBeOnTheScreen();
    expect(renderedFontSizes(container).every((size) => size > 0)).toBe(true);
  });
});

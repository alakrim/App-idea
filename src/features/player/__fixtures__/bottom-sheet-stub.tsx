 
/**
 * Unit-test stand-in for @gorhom/bottom-sheet. A sheet renders its contents only while open, the
 * way the real one does, so closed sheets contribute nothing to the queries.
 */
import { createElement, type ReactNode } from 'react';
import { View } from 'react-native';

interface StubSheetProps {
  index?: number;
  children?: ReactNode;
}

function BottomSheet({ index = -1, children }: StubSheetProps) {
  return index >= 0 ? createElement(View, { testID: 'bottom-sheet' }, children) : null;
}

module.exports = {
  __esModule: true,
  default: BottomSheet,
  BottomSheetBackdrop: () => null,
  BottomSheetView: ({ children, style }: { children?: ReactNode; style?: unknown }) =>
    createElement(View, { style: style as never }, children),
};

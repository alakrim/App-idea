import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetScrollView,
  BottomSheetView,
} from '@gorhom/bottom-sheet';
import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import {
  AccessibilityInfo,
  BackHandler,
  findNodeHandle,
  StyleSheet,
  View,
  type FlatListProps,
} from 'react-native';

import { Text } from './text';
import { useTheme } from './theme';
import { radius, space } from './tokens';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** Heading, also the sheet's accessible header. Focus moves here when the sheet opens. */
  title: string;
  children: ReactNode;
  snapPoints?: readonly (string | number)[];
  /** For long content that is not a list: the whole body scrolls inside the sheet. */
  scrollable?: boolean;
}

/**
 * Bottom sheet on @gorhom/bottom-sheet (Reanimated 4 compatible). Must sit under a
 * GestureHandlerRootView, which the root layout provides.
 *
 * An open sheet is modal for assistive tech, and Android back closes it. Lists inside a sheet must
 * use `SheetList`: a plain FlatList does not scroll under the sheet's pan gesture.
 */
export function Sheet({
  visible,
  onClose,
  title,
  children,
  snapPoints = ['60%'],
  scrollable = false,
}: SheetProps) {
  const { colors } = useTheme();
  const titleRef = useRef<View>(null);
  useBackClosesSheet(visible, onClose);
  useFocusOnOpen(visible, titleRef);

  const body = (
    <>
      <View ref={titleRef} accessible accessibilityRole="header">
        <Text variant="heading">{title}</Text>
      </View>
      {children}
    </>
  );

  return (
    <BottomSheet
      index={visible ? 0 : -1}
      snapPoints={[...snapPoints]}
      enablePanDownToClose
      onClose={onClose}
      backdropComponent={(props) => (
        <BottomSheetBackdrop
          {...props}
          appearsOnIndex={0}
          disappearsOnIndex={-1}
          pressBehavior="close"
          style={[props.style, { backgroundColor: colors.scrim }]}
        />
      )}
      backgroundStyle={[styles.background, { backgroundColor: colors.surfaceRaised }]}
      handleIndicatorStyle={{ backgroundColor: colors.decorativeFaint }}
    >
      {scrollable ? (
        <BottomSheetScrollView
          testID="sheet-body"
          accessibilityViewIsModal={visible}
          contentContainerStyle={styles.content}
        >
          {body}
        </BottomSheetScrollView>
      ) : (
        <BottomSheetView
          testID="sheet-body"
          accessibilityViewIsModal={visible}
          style={styles.content}
        >
          {body}
        </BottomSheetView>
      )}
    </BottomSheet>
  );
}

/** A scrollable list for a sheet. It must be the body's only scroller; the sheet owns the gesture. */
export function SheetList<Item>({ contentContainerStyle, ...rest }: FlatListProps<Item>) {
  return (
    <BottomSheetFlatList<Item>
      {...rest}
      contentContainerStyle={[styles.listContent, contentContainerStyle]}
    />
  );
}

/** Android back closes an open sheet instead of leaving the screen behind it. */
function useBackClosesSheet(visible: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => {
      subscription.remove();
    };
  }, [visible, onClose]);
}

/** Moves screen-reader focus to the sheet title when it opens, so the sheet is announced. */
function useFocusOnOpen(visible: boolean, titleRef: RefObject<View | null>): void {
  useEffect(() => {
    if (!visible) {
      return;
    }
    const tag = findNodeHandle(titleRef.current);
    if (tag !== null) {
      AccessibilityInfo.setAccessibilityFocus(tag);
    }
  }, [visible, titleRef]);
}

const styles = StyleSheet.create({
  background: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  content: {
    flex: 1,
    gap: space.lg,
    paddingHorizontal: space.lg,
    paddingBottom: space.xxl,
  },
  listContent: {
    paddingBottom: space.xl,
  },
});

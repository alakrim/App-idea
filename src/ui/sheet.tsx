import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { StyleSheet } from 'react-native';

import { Text } from './text';
import { useTheme } from './theme';
import { radius, space } from './tokens';

import type { ReactNode } from 'react';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** Heading, also the sheet's accessible header. */
  title: string;
  children: ReactNode;
  snapPoints?: readonly (string | number)[];
}

/**
 * Bottom sheet on @gorhom/bottom-sheet (Reanimated 4 compatible). Must sit under a
 * GestureHandlerRootView, which the root layout provides.
 */
export function Sheet({ visible, onClose, title, children, snapPoints = ['60%'] }: SheetProps) {
  const { colors } = useTheme();

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
      handleIndicatorStyle={{ backgroundColor: colors.textFaint }}
    >
      <BottomSheetView style={styles.content}>
        <Text variant="heading" accessibilityRole="header">
          {title}
        </Text>
        {children}
      </BottomSheetView>
    </BottomSheet>
  );
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
});

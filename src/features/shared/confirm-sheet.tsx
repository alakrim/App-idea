import { StyleSheet, View } from 'react-native';

import { Button } from '@/ui/button';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

export interface ConfirmSheetProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** Red confirm button, for deletes. */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A confirmation step before an action that cannot be undone or that costs money. */
export function ConfirmSheet({
  visible,
  title,
  message,
  confirmLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  return (
    <Sheet visible={visible} onClose={onCancel} title={title} snapPoints={['40%']}>
      <Text variant="body" tone="muted">
        {message}
      </Text>
      <View style={styles.actions}>
        <Button
          label={confirmLabel}
          variant={destructive ? 'danger' : 'primary'}
          size="lg"
          fullWidth
          onPress={onConfirm}
        />
        <Button label="Cancel" variant="ghost" size="lg" fullWidth onPress={onCancel} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  actions: {
    gap: space.sm,
    marginTop: space.sm,
  },
});

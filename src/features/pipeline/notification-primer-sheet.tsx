import { StyleSheet, View } from 'react-native';

import { Button } from '@/ui/button';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';
import { space } from '@/ui/tokens';

export interface NotificationPrimerSheetProps {
  visible: boolean;
  onAllow: () => void;
  onNotNow: () => void;
}

/**
 * Asked once, the first time a chapter is queued in the foreground and notifications are off. It
 * explains the notification before the system asks for it, so a refusal is an informed one.
 */
export function NotificationPrimerSheet({
  visible,
  onAllow,
  onNotNow,
}: NotificationPrimerSheetProps) {
  return (
    <Sheet
      visible={visible}
      onClose={onNotNow}
      title="Show progress in notifications"
      snapPoints={['40%']}
    >
      <Text variant="body" tone="muted">
        See progress while Lectio prepares chapters in the background. Preparation keeps going
        either way.
      </Text>
      <View style={styles.actions}>
        <Button label="Allow notifications" size="lg" fullWidth onPress={onAllow} />
        <Button label="Not now" variant="ghost" size="lg" fullWidth onPress={onNotNow} />
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

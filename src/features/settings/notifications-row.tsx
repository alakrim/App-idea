import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Linking } from 'react-native';

import { createNotificationPermission } from '@/services/background/notification-permission';
import { Bell } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { useToast } from '@/ui/toast';

const EXPLANATION = 'Lectio shows progress while it prepares chapters in the background.';

/**
 * The Settings row for notifications. It shows whether they are on, says what they are for, and
 * opens the system settings where the switch lives. The state is read again on every focus, so a
 * change made in the system settings shows when the listener comes back.
 */
export function NotificationsRow() {
  const permission = useMemo(() => createNotificationPermission(), []);
  const toast = useToast();
  const [granted, setGranted] = useState<boolean | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      permission.isGranted().then(
        (value) => {
          if (active) setGranted(value);
        },
        () => {
          if (active) setGranted(false);
        },
      );
      return () => {
        active = false;
      };
    }, [permission]),
  );

  const state = granted === null ? 'Checking' : granted ? 'On' : 'Off';

  return (
    <ListItem
      title="Notifications"
      subtitle={`${state}. ${EXPLANATION}`}
      leading={Bell}
      onPress={() => {
        Linking.openSettings().catch(() => {
          toast.show({
            message:
              'Could not open the system settings. Open Lectio there to change notifications.',
            tone: 'danger',
          });
        });
      }}
      accessibilityHint="Opens the system settings for Lectio"
    />
  );
}

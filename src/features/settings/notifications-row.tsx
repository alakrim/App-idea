import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking } from 'react-native';

import {
  notificationPermissionStatus,
  requestNotificationPermission,
  type NotificationPermission,
} from '@/services/background';
import { Bell } from '@/ui/icons';
import { ListItem } from '@/ui/list-item';
import { useToast } from '@/ui/toast';

const EXPLANATION = 'Lectio shows progress while it prepares chapters in the background.';

const STATE_LABEL: Record<NotificationPermission, string> = {
  granted: 'On',
  denied: 'Off',
  undetermined: 'Not asked yet',
};

/**
 * The Settings row for notifications. It shows whether they are on, says what they are for, and
 * acts on the state: a permission not yet asked is requested here, and otherwise the row opens the
 * system settings where the switch lives. The state is read again on every focus, so a change made
 * in the system settings shows when the screen comes back.
 */
export function NotificationsRow() {
  const toast = useToast();
  const [permission, setPermission] = useState<NotificationPermission | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      notificationPermissionStatus().then(
        (value) => {
          if (active) setPermission(value);
        },
        () => {
          if (active) setPermission('denied');
        },
      );
      return () => {
        active = false;
      };
    }, []),
  );

  const state = permission === null ? 'Checking' : STATE_LABEL[permission];

  const onPress = () => {
    if (permission === 'undetermined') {
      requestNotificationPermission().then(setPermission, () => setPermission('denied'));
      return;
    }
    Linking.openSettings().catch(() => {
      toast.show({
        message: 'Could not open the system settings. Open Lectio there to change notifications.',
        tone: 'danger',
      });
    });
  };

  return (
    <ListItem
      title="Notifications"
      subtitle={`${state}. ${EXPLANATION}`}
      leading={Bell}
      onPress={onPress}
      accessibilityHint={
        permission === 'undetermined'
          ? 'Asks for permission to show notifications'
          : 'Opens the system settings for Lectio'
      }
    />
  );
}

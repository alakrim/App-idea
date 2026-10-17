import { useEffect, useState } from 'react';

import { useSettings } from '@/features/settings/settings-store';
import { notificationPermissionStatus, requestNotificationPermission } from '@/services/background';
import { Button } from '@/ui/button';
import { Sheet } from '@/ui/sheet';
import { Text } from '@/ui/text';

import { shouldExplainNotifications } from './notification-rule';

export interface NotificationPromptProps {
  /** True while the queue has chapters to process. */
  busy: boolean;
}

/**
 * Explains the processing notification the first time a chapter is queued. "Allow" starts the
 * system prompt, and "Not now" (or dragging the sheet away) records that the user has answered. Either
 * way processing is never blocked: the sheet only appears above the app.
 */
export function NotificationPrompt({ busy }: NotificationPromptProps) {
  const { settings, patch } = useSettings();
  const explained = settings.notificationsExplained;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!busy || explained) return undefined;
    let cancelled = false;
    notificationPermissionStatus()
      .then((permission) => {
        if (!cancelled && shouldExplainNotifications(permission, explained)) setVisible(true);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [busy, explained]);

  const answer = (allow: boolean) => {
    setVisible(false);
    patch({ notificationsExplained: true });
    if (allow) void requestNotificationPermission().catch(() => undefined);
  };

  return (
    <Sheet
      visible={visible}
      onClose={() => answer(false)}
      title="Keep going in the background"
      snapPoints={['44%']}
    >
      <Text variant="body" tone="muted">
        Lectio shows a quiet notification while it prepares your chapter, so it can finish even when
        you leave the app.
      </Text>
      <Button label="Allow" fullWidth onPress={() => answer(true)} />
      <Button label="Not now" variant="ghost" fullWidth onPress={() => answer(false)} />
    </Sheet>
  );
}

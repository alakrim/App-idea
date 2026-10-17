/*
 * When to show the notification explainer (brief BG1). It appears once: the first time a chapter is
 * queued while the system has not yet asked for the notification permission. Pure, so the rule is
 * tested without a device.
 */
import type { NotificationPermission } from '@/services/background';

export function shouldExplainNotifications(
  permission: NotificationPermission,
  explained: boolean,
): boolean {
  return permission === 'undetermined' && !explained;
}

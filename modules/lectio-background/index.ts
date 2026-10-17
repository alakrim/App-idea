/*
 * Typed JavaScript API of the lectio-background module (brief BG1, ADR-0007).
 *
 * On Android the module runs a foreground service while chapters are processed, so processing
 * survives leaving the app. Its notification shows the chapter, the stage and a progress bar, and
 * carries a Cancel action. Everywhere else (iOS, web, Jest, or a build without the native module)
 * every function is a safe no-op, so callers never need a platform check.
 */
import { requireOptionalNativeModule } from 'expo-modules-core';
import { Platform } from 'react-native';

import type { EventSubscription } from 'expo-modules-core';

export interface ProcessingNotice {
  /** The chapter the notification opens and whose Cancel action cancels it. */
  readonly chapterId: string;
  /** The chapter title. */
  readonly title: string;
  /** One line on the stage, such as "Narrating · 40%" or "Waiting for connection". */
  readonly text: string;
  /** Overall progress, from 0 to 1. The notification shows it as a determinate bar. */
  readonly progress: number;
}

/** `granted` and `denied` are the answers of the system prompt. `undetermined` is not asked yet. */
export type NotificationPermission = 'granted' | 'denied' | 'undetermined';

type LectioBackgroundEvents = {
  onCancel: (event: { chapterId: string }) => void;
  /** Android 15 ended the service's time budget. The service has stopped; the queue is intact. */
  onTimeout: () => void;
};

interface NativeLectioBackground {
  /** Expo's native module emitter: every module that declares events has this method. */
  addListener<Name extends keyof LectioBackgroundEvents>(
    eventName: Name,
    listener: LectioBackgroundEvents[Name],
  ): EventSubscription;
  startProcessing(notice: ProcessingNotice): Promise<boolean>;
  updateProcessing(notice: ProcessingNotice): Promise<void>;
  stopProcessing(): Promise<void>;
  requestNotificationPermission(): Promise<'granted' | 'denied'>;
  notificationPermissionStatus(): Promise<NotificationPermission>;
}

const native =
  Platform.OS === 'android'
    ? requireOptionalNativeModule<NativeLectioBackground>('LectioBackground')
    : null;

const NO_SUBSCRIPTION: EventSubscription = { remove: () => undefined };

/**
 * Starts the foreground service with the notice. Resolves to false when the service could not be
 * started, which Android does for a start from the background. Processing carries on without it.
 */
export async function startProcessing(notice: ProcessingNotice): Promise<boolean> {
  if (!native) return false;
  try {
    return await native.startProcessing(notice);
  } catch {
    return false;
  }
}

/** Updates the running notification. It does nothing when the service is not running. */
export async function updateProcessing(notice: ProcessingNotice): Promise<void> {
  if (!native) return;
  await native.updateProcessing(notice).catch(() => undefined);
}

export async function stopProcessing(): Promise<void> {
  if (!native) return;
  await native.stopProcessing().catch(() => undefined);
}

/** Calls `listener` with the chapter id when the notification's Cancel action is tapped. */
export function addCancelListener(listener: (chapterId: string) => void): EventSubscription {
  if (!native) return NO_SUBSCRIPTION;
  return native.addListener('onCancel', (event) => listener(event.chapterId));
}

/** Calls `listener` when Android ends the service's time budget. */
export function addTimeoutListener(listener: () => void): EventSubscription {
  if (!native) return NO_SUBSCRIPTION;
  return native.addListener('onTimeout', listener);
}

/**
 * Asks for the notification permission (Android 13+). Platforms without this notification need no
 * permission and report it granted. Android without the native module reports it denied, so
 * processing runs without a notification.
 */
export async function requestNotificationPermission(): Promise<'granted' | 'denied'> {
  if (Platform.OS !== 'android') return 'granted';
  return native ? native.requestNotificationPermission() : 'denied';
}

export async function notificationPermissionStatus(): Promise<NotificationPermission> {
  if (Platform.OS !== 'android') return 'granted';
  return native ? native.notificationPermissionStatus() : 'denied';
}

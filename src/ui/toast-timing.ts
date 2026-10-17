import type { ToastInput } from './toast';

/** A toast without a button clears itself after a few seconds. */
export const TOAST_DURATION_MS = 3500;
/** A toast with a button stays long enough to read and tap, so the action is never lost. */
export const ACTION_TOAST_DURATION_MS = 8000;

/** How long a toast stays before it clears itself. Pure, so the rule is unit-tested without React. */
export function toastDurationMs(input: Pick<ToastInput, 'action'>): number {
  return input.action === undefined ? TOAST_DURATION_MS : ACTION_TOAST_DURATION_MS;
}

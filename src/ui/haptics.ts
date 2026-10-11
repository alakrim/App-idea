import * as Haptics from 'expo-haptics';

/**
 * Haptics are best-effort: unsupported devices and simulators reject the call, and a failed buzz
 * must never break a tap.
 */
export function selectionHaptic(): void {
  Haptics.selectionAsync().catch(() => undefined);
}

export function impactHaptic(): void {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
}

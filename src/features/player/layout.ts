import { minTouchTarget } from '@/ui/tokens';

/**
 * Geometry of the player surfaces. Colours, spacing and type come from src/ui/tokens; these are the
 * few sizes that only exist on the player.
 */
export const PLAYER = {
  /** Cover height as a share of the window, clamped to the min and max below. */
  coverHeightRatio: 0.36,
  coverMinHeight: 180,
  coverMaxHeight: 340,
  playButtonSize: 76,
  skipButtonSize: 56,
  skipIconSize: 26,
  playIconSize: 30,
  scrubHitHeight: minTouchTarget,
  scrubTrackHeight: 4,
  scrubThumbSize: 16,
  scrubTickHeight: 6,
  scrubThumbRing: 2,
  /** Sentence ticks stay faint so they never compete with the thumb. */
  tickOpacity: 0.35,
  /** The buffer band shows the audio made so far: subtle, behind the played part. */
  bufferOpacity: 0.4,
  /** The buffer band shows the audio made so far: subtle, behind the played part. */
  bufferOpacity: 0.4,
  scrubBubbleWidth: 56,
  /** Height of the text pane when it is collapsed, before the bottom inset. */
  peekHeight: 112,
  /** Height of the text pane when it is open, as a share of the window. */
  paneHeightRatio: 0.88,
  /** Where a repeated or followed sentence sits in the pane, from the top (0 to 1). */
  followAnchor: 0.35,
  /** How long auto-scroll stays paused after the listener scrolls the text by hand. */
  autoScrollPauseMs: 5000,
  /** Opacity of the cover colour behind the blurred backdrop, in the dark and light themes. */
  backdropTintAlpha: 0.45,
  backdropTintAlphaLight: 0.22,
  /** Duration of the smooth glide used for progress and position, between engine updates. */
  glideMs: 260,
} as const;

/** Appends an alpha byte to a #RRGGBB colour, giving #RRGGBBAA for gradients. */
export function withAlpha(hex: string, alpha: number): string {
  const byte = Math.round(Math.min(1, Math.max(0, alpha)) * 255);
  return `${hex}${byte.toString(16).padStart(2, '0')}`;
}

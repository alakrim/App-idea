/*
 * The narration profile a chapter is narrated with, derived from the narration settings. Its id is
 * a pure function of (provider, model, voice, style, speed), so the same settings always reach the
 * same `narration_profiles` row, and audio segments can say which voice made them.
 */
import type { NarrationProfile } from '@/core/domain';
import { stableHash } from '@/core/pipeline/hash';
import type { NarrationSettings } from '@/core/settings';

/**
 * A ULID-shaped id: 26 characters of uppercase hex, which are all valid Crockford base32. The hash
 * is two FNV lanes over the same inputs with different salts, so 26 hex digits (104 bits) are used.
 */
export function narrationProfileId(settings: NarrationSettings): string {
  const parts = [settings.provider, settings.model, settings.voice, settings.style, settings.speed];
  const digest = stableHash(['narration-profile', ...parts]) + stableHash(['salt', ...parts]);
  return digest.slice(0, 26).toUpperCase();
}

/** The profile row for the current narration settings. */
export function narrationProfileFor(settings: NarrationSettings): NarrationProfile {
  return {
    id: narrationProfileId(settings),
    name: `${settings.voice} (${settings.model})`,
    provider: settings.provider,
    model: settings.model,
    voice: settings.voice,
    style: settings.style,
    speed: settings.speed,
  };
}

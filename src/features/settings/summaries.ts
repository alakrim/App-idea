import type { Settings, ThemeMode } from '@/core/settings';

import { formatBytes, formatPercent, formatUsdPrecise, modelLabel } from './format';
import { languageLabel } from '@/features/shared/languages';

/** The current-value subtitles on the settings home. Pure, so each rule is testable. */

export const MINUS_SIGN = '−';

export function formatDb(levelDb: number): string {
  const rounded = Math.round(levelDb);
  const sign = rounded < 0 ? MINUS_SIGN : rounded > 0 ? '+' : '';
  return `${sign}${Math.abs(rounded)} dB`;
}

const THEME_LABELS: Readonly<Record<ThemeMode, string>> = {
  system: 'System',
  dark: 'Dark',
  light: 'Light',
};

export function themeLabel(mode: ThemeMode): string {
  return THEME_LABELS[mode];
}

export function narrationSummary(narration: Settings['narration']): string {
  if (narration.provider === 'device') {
    return `Device voice · ${narration.voice}`;
  }
  return `${modelLabel(narration.model)} · ${narration.voice}`;
}

export function translationSummary(
  settings: Pick<Settings, 'translationModel' | 'defaultTargetLang'>,
): string {
  return `${modelLabel(settings.translationModel)} · ${languageLabel(settings.defaultTargetLang)}`;
}

export function analysisSummary(
  settings: Pick<Settings, 'analysisModel' | 'cleanupModel'>,
): string {
  return `${modelLabel(settings.analysisModel)} · ${modelLabel(settings.cleanupModel)}`;
}

export function ambienceSummary(ambience: Settings['ambience']): string {
  return ambience.enabled ? `On · ${formatDb(ambience.levelDb)}` : 'Off';
}

export function readingSummary(reading: Settings['reading']): string {
  return `Text size ${formatPercent(reading.fontScale)}`;
}

export function usageSummary(today: number, month: number): string {
  return `Today ${formatUsdPrecise(today)} · 30 days ${formatUsdPrecise(month)}`;
}

export function storageSummary(usedBytes: number, freeBytes: number): string {
  return `${formatBytes(usedBytes)} used · ${formatBytes(freeBytes)} free`;
}

export function apiKeySummary(
  status: 'unknown' | 'missing' | 'present',
  tail: string | null,
): string {
  if (status === 'present') {
    return tail ? `Connected · ending ${tail}` : 'Connected';
  }
  if (status === 'missing') return 'Not set';
  return 'Checking…';
}

import { formatUsd } from '@/core/llm/cost';

/** Display helpers for settings rows and screens. Pure, so they are unit-testable. */

const WORD_OVERRIDES: Readonly<Record<string, string>> = {
  gpt: 'GPT',
  tts: 'TTS',
  ai: 'AI',
};

const VENDOR_NAMES: Readonly<Record<string, string>> = {
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  'meta-llama': 'Meta',
  mistralai: 'Mistral',
  deepseek: 'DeepSeek',
  'x-ai': 'xAI',
  qwen: 'Qwen',
  elevenlabs: 'ElevenLabs',
  hexgrad: 'Hexgrad',
  microsoft: 'Microsoft',
  deepgram: 'Deepgram',
  'fish-audio': 'Fish Audio',
  minimax: 'MiniMax',
  canopylabs: 'Canopy Labs',
  sesame: 'Sesame',
  'bytedance-seed': 'ByteDance Seed',
};

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function vendorOf(modelId: string): string {
  const slash = modelId.indexOf('/');
  return slash === -1 ? '' : modelId.slice(0, slash);
}

/** "anthropic/claude-haiku-5.5" becomes "Claude Haiku 5.5". Variant suffixes such as ":free" are dropped. */
export function modelLabel(modelId: string): string {
  const slash = modelId.indexOf('/');
  const slug = slash === -1 ? modelId : modelId.slice(slash + 1);
  const base = slug.split(':')[0] ?? slug;
  return base
    .split(/[-_]/)
    .filter((word) => word.length > 0)
    .map((word) => WORD_OVERRIDES[word.toLowerCase()] ?? capitalize(word))
    .join(' ');
}

export function providerLabel(modelId: string): string {
  const vendor = vendorOf(modelId);
  return VENDOR_NAMES[vendor] ?? capitalize(vendor);
}

/** Price per one million units, from a per-unit USD price. Zero means free. */
export function formatPerMillion(perUnit: number): string {
  if (perUnit <= 0) return 'Free';
  const cents = Math.round(perUnit * 1_000_000 * 100) / 100;
  return `$${cents.toFixed(2)}`;
}

export function formatContext(tokens: number): string {
  if (tokens <= 0) return '—';
  if (tokens < 1_000) return String(tokens);
  if (tokens < 1_000_000) return `${Math.round(tokens / 1_000)}K`;
  return `${(tokens / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

/** Hourly narration cost, shown as "≈ $0.55/h". Costs under a cent are shown as a bound. */
export function formatHourlyCost(usdPerHour: number): string {
  if (usdPerHour < 0.01) return 'under $0.01/h';
  return `≈ ${formatUsd(usdPerHour)}/h`;
}

/** Small amounts need more digits than `formatUsd` gives. Used for per-preview costs. */
export function formatUsdPrecise(amount: number): string {
  if (amount <= 0) return '$0';
  if (amount < 0.01) return `$${amount.toFixed(4)}`;
  return formatUsd(amount);
}

export function formatBytes(bytes: number): string {
  const safe = Math.max(0, bytes);
  if (safe < 1024) return `${Math.round(safe)} B`;
  const kib = safe / 1024;
  if (kib < 1024) return `${kib.toFixed(kib < 10 ? 1 : 0)} KB`;
  const mib = kib / 1024;
  if (mib < 1024) return `${mib.toFixed(mib < 10 ? 1 : 0)} MB`;
  return `${(mib / 1024).toFixed(1)} GB`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Last four characters of a key, for display. Shorter inputs show no characters at all. */
export function keyTail(key: string): string {
  return key.length > 4 ? key.slice(-4) : '';
}

import type { PipelineError } from '@/core/domain';

/**
 * Keys are never rendered in full after they are saved. These helpers only ever expose the
 * fixed prefix and the last four characters.
 */

export const KEY_PREFIX = 'sk-or-';

export const INVALID_KEY_FORMAT_MESSAGE =
  'That does not look like an OpenRouter key. Keys start with "sk-or-". Copy it again from openrouter.ai/keys.';

/** Masked label for a saved key, such as "sk-or-••••a1b2". */
export function maskApiKey(tail: string): string {
  return `${KEY_PREFIX}••••${tail}`;
}

/** Plain-language copy for a failed key check. Each message says what to do next. */
export function describeKeyError(error: PipelineError): string {
  switch (error.code) {
    case 'AUTH':
      return 'OpenRouter did not accept this key. Copy it again from openrouter.ai/keys. Nothing was saved.';
    case 'NETWORK':
      return 'No answer from OpenRouter. Check your connection and try again. Nothing was saved.';
    case 'RATE_LIMITED':
      return 'OpenRouter is busy right now. Wait a moment, then try again.';
    default:
      return `${error.message} Nothing was saved.`;
  }
}

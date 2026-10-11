import { PipelineFailure } from '@/services/openrouter/errors';

/** What the inline error offers. `settings` opens Settings, `retry` asks again, `library` opens the shelf. */
export type AskErrorAction = 'settings' | 'retry' | 'library';

export interface AskErrorCopy {
  readonly title: string;
  readonly message: string;
  readonly action: AskErrorAction;
  readonly actionLabel: string;
}

/**
 * Plain-language copy for a failed question. Every branch says what happened and what to do next.
 * Anything unknown falls back to a retry, so a failure is never a dead end.
 */
export function askErrorCopy(error: unknown): AskErrorCopy {
  if (error instanceof PipelineFailure) {
    switch (error.error.code) {
      case 'AUTH':
        return {
          title: 'Add your key first',
          message: 'Add your OpenRouter key in Settings to ask questions.',
          action: 'settings',
          actionLabel: 'Open Settings',
        };
      case 'INSUFFICIENT_CREDITS':
        return {
          title: 'Out of credits',
          message: 'Your OpenRouter credits are used up. Add credits, then try again.',
          action: 'retry',
          actionLabel: 'Try again',
        };
      case 'NETWORK':
        return {
          title: "You're offline",
          message: 'Check your connection, then try again.',
          action: 'retry',
          actionLabel: 'Try again',
        };
      case 'RATE_LIMITED':
        return {
          title: 'Too many requests',
          message: 'Wait a moment, then try again.',
          action: 'retry',
          actionLabel: 'Try again',
        };
      case 'MODEL_UNAVAILABLE':
        return {
          title: 'Model unavailable',
          message: 'The analysis model is not available right now. Pick another in Settings.',
          action: 'settings',
          actionLabel: 'Open Settings',
        };
      default:
        break;
    }
  }
  return {
    title: "Couldn't get an answer",
    message: 'Something went wrong while answering. Try again.',
    action: 'retry',
    actionLabel: 'Try again',
  };
}

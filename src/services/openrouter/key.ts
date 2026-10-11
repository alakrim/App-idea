import { z } from 'zod';

import type { PipelineError } from '@/core/domain';

import { PipelineFailure } from './errors';
import { jsonBody } from './transport';

import type { Transport } from './transport';

export type KeyCheck =
  | {
      valid: true;
      label: string;
      usage: number;
      limit: number | null;
      limitRemaining: number | null;
      isFreeTier: boolean;
    }
  | { valid: false; error: PipelineError };

const keyResponseSchema = z.object({
  data: z.object({
    label: z.string(),
    limit: z.number().nullish(),
    limit_remaining: z.number().nullish(),
    usage: z.number(),
    is_free_tier: z.boolean().nullish(),
  }),
});

/** Checks the user's key with GET /key. Expected failures come back as `valid: false`. */
export async function validateKey(deps: { transport: Transport }): Promise<KeyCheck> {
  try {
    const { data } = await deps.transport.request(
      { method: 'GET', path: '/key', accept: 'application/json' },
      jsonBody(keyResponseSchema),
    );
    return {
      valid: true,
      label: data.label,
      usage: data.usage,
      limit: data.limit ?? null,
      limitRemaining: data.limit_remaining ?? null,
      isFreeTier: data.is_free_tier ?? false,
    };
  } catch (error) {
    if (error instanceof PipelineFailure && error.error.code !== 'CANCELLED') {
      return { valid: false, error: error.error };
    }
    throw error;
  }
}

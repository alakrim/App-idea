/*
 * LlmPort: transport v2 for the core. Each stage asks for a transport bound to one model. A call
 * goes through the OpenRouter client's chatRaw, which returns the reply text and the real usage, so
 * the cost meter records what OpenRouter billed. The core validates the reply, not this adapter.
 */
import type { LlmTransport } from '@/core/llm/transport';
import type { LlmPort } from '@/core/pipeline/ports';
import type { OpenRouterClient } from '@/services/openrouter';

export interface LlmPortDeps {
  readonly openrouter: Pick<OpenRouterClient, 'chatRaw'>;
}

export function createLlmPort({ openrouter }: LlmPortDeps): LlmPort {
  return {
    transportFor(modelId): LlmTransport {
      return async (request) => {
        const reply = await openrouter.chatRaw({
          model: modelId,
          system: request.system,
          user: request.user,
          ...(request.jsonSchema === undefined ? {} : { jsonSchema: request.jsonSchema }),
          ...(request.signal === undefined ? {} : { signal: request.signal }),
          ...(request.cacheSystem === undefined ? {} : { cacheSystem: request.cacheSystem }),
        });
        return {
          text: reply.text,
          usage: {
            promptTokens: reply.usage.promptTokens,
            completionTokens: reply.usage.completionTokens,
            costUsd: reply.usage.costUsd,
          },
          generationId: reply.generationId,
        };
      };
    },
  };
}

import { estimateChatCost, estimateSpeechCost } from '../llm/cost';

import type { Id, Stage, UsageEntry } from '../domain';
import type { CatalogModel, PipelinePorts } from './ports';
import type { LlmTransport, LlmUsage } from '../llm/transport';

export interface MeterDeps {
  readonly ports: Pick<PipelinePorts, 'ledger' | 'catalog' | 'clock' | 'ids'>;
  readonly chapterId: Id;
  readonly stage: Stage;
  /** Called after each recorded call with the call's cost. */
  readonly onSpend: (usd: number) => void;
}

/**
 * Records every model and speech call of one stage run to the usage ledger. The cost is the
 * provider-reported one when present, and otherwise the catalog price times the reported tokens.
 * A model that is not in the catalog records 0, and the estimate for it is shown as unknown.
 */
export class CostMeter {
  private spent = 0;
  private readonly catalog = new Map<string, CatalogModel | null>();

  constructor(private readonly deps: MeterDeps) {}

  get spentUsd(): number {
    return this.spent;
  }

  /** Wraps a transport so that each successful call is recorded before its reply is returned. */
  transport(modelId: string, inner: LlmTransport): LlmTransport {
    return async (request) => {
      const reply = await inner(request);
      await this.recordChat(modelId, reply.usage);
      return reply;
    };
  }

  /** Records one chat or PDF-parse call. */
  async recordChat(modelId: string, usage: LlmUsage): Promise<void> {
    const model = await this.lookup(modelId);
    const costUsd =
      usage.costUsd ??
      (model ? estimateChatCost(model, usage.promptTokens, usage.completionTokens) : 0);
    await this.write({
      model: modelId,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      audioSeconds: null,
      costUsd,
    });
  }

  /** Records one speech call. `costUsd` is the provider's figure when it sent one. */
  async recordSpeech(
    modelId: string,
    spec: { chars: number; audioSeconds: number; costUsd: number | null },
  ): Promise<void> {
    const model = await this.lookup(modelId);
    const costUsd =
      spec.costUsd ?? (model ? estimateSpeechCost(model, spec.chars, spec.audioSeconds) : 0);
    await this.write({
      model: modelId,
      promptTokens: spec.chars,
      completionTokens: 0,
      audioSeconds: spec.audioSeconds,
      costUsd,
    });
  }

  private async lookup(modelId: string): Promise<CatalogModel | null> {
    if (!this.catalog.has(modelId)) {
      this.catalog.set(modelId, await this.deps.ports.catalog.find(modelId));
    }
    return this.catalog.get(modelId) ?? null;
  }

  private async write(
    entry: Pick<
      UsageEntry,
      'model' | 'promptTokens' | 'completionTokens' | 'audioSeconds' | 'costUsd'
    >,
  ): Promise<void> {
    const { ports, chapterId, stage, onSpend } = this.deps;
    await ports.ledger.record({
      id: ports.ids(),
      at: ports.clock.now(),
      chapterId,
      stage,
      generationId: null,
      ...entry,
    });
    this.spent += entry.costUsd;
    onSpend(entry.costUsd);
  }
}

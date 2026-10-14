import { chatCostOrNull, speechCostOrNull } from '../llm/cost';
import { paidCallEntry } from '../llm/usage-entry';

import type { Id, Stage, UsageEntry } from '../domain';
import type { LlmTransport, LlmUsage } from '../llm/transport';
import type { CatalogModel, PipelinePorts } from './ports';

export interface MeterDeps {
  readonly ports: Pick<PipelinePorts, 'ledger' | 'catalog' | 'clock' | 'ids'>;
  readonly chapterId: Id;
  readonly stage: Stage;
  /** Called after each recorded call with the call's cost. An unknown cost is reported as zero. */
  readonly onSpend: (usd: number) => void;
}

/**
 * Records every model and speech call of one stage run to the usage ledger. The cost is the
 * provider-reported one when present, and otherwise the catalog price times the reported units. When
 * neither is known, the ledger stores null: an unknown cost is never recorded as $0.
 */
export class CostMeter {
  private spent = 0;
  private readonly catalog = new Map<string, CatalogModel | null>();

  constructor(private readonly deps: MeterDeps) {}

  /** Money spent by this run so far. Calls with an unknown cost add nothing here, so it is a floor. */
  get spentUsd(): number {
    return this.spent;
  }

  /** Wraps a transport so that each successful call is recorded before its reply is returned. */
  transport(modelId: string, inner: LlmTransport): LlmTransport {
    return async (request) => {
      const reply = await inner(request);
      await this.recordChat(modelId, reply.usage, reply.generationId);
      return reply;
    };
  }

  /** Records one chat or PDF-parse call. */
  async recordChat(modelId: string, usage: LlmUsage, generationId: string | null): Promise<void> {
    const model = await this.lookup(modelId);
    await this.write({
      model: modelId,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      audioSeconds: null,
      costUsd: chatCostOrNull(
        usage.costUsd,
        model,
        usage.promptTokens,
        usage.completionTokens,
      ),
      generationId,
    });
  }

  /** Records one speech call. `costUsd` is the provider's figure when it sent one. */
  async recordSpeech(
    modelId: string,
    spec: { chars: number; audioSeconds: number; costUsd: number | null; generationId: string | null },
  ): Promise<void> {
    const model = await this.lookup(modelId);
    await this.write({
      model: modelId,
      promptTokens: spec.chars,
      completionTokens: 0,
      audioSeconds: spec.audioSeconds,
      costUsd: speechCostOrNull(spec.costUsd, model, spec.chars, spec.audioSeconds),
      generationId: spec.generationId,
    });
  }

  /**
   * The catalog's price for a model. A failed lookup is not an error for the stage: the call is
   * still recorded, with an unknown cost. The failure is not cached, so a later call can price it.
   */
  private async lookup(modelId: string): Promise<CatalogModel | null> {
    if (this.catalog.has(modelId)) return this.catalog.get(modelId) ?? null;
    try {
      const model = await this.deps.ports.catalog.find(modelId);
      this.catalog.set(modelId, model);
      return model;
    } catch {
      return null;
    }
  }

  private async write(
    call: Pick<
      UsageEntry,
      'model' | 'promptTokens' | 'completionTokens' | 'audioSeconds' | 'costUsd' | 'generationId'
    >,
  ): Promise<void> {
    const { ports, chapterId, stage, onSpend } = this.deps;
    await ports.ledger.record(
      paidCallEntry({
        id: ports.ids(),
        at: ports.clock.now(),
        chapterId,
        stage,
        ...call,
      }),
    );
    this.spent += call.costUsd ?? 0;
    onSpend(call.costUsd ?? 0);
  }
}

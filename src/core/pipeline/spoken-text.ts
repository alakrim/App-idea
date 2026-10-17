/*
 * The spoken text of a chapter, sentence by sentence, as it becomes final (ADR-0008).
 *
 * Translation publishes a sentence once its text is final: the translation, or the source text when
 * there is none. Narration reads the contiguous run of final sentences from the start and waits for
 * more. The invariant that narration relies on: a published sentence never changes. So a segment
 * planned over the final prefix is the same segment as in the finished chapter, and it can be
 * synthesized at once.
 */
import { untilSettled } from './abort';
import { countCodePoints } from '../text/build';

import type { ParagraphKind } from '../domain';

/** A sentence as the chapter stores it, before any translation. */
export interface SpokenSource {
  readonly idx: number;
  readonly paragraphIdx: number;
  readonly kind: ParagraphKind;
  readonly text: string;
}

/** A final sentence, ready for segment planning. Its text is trimmed. */
export interface SpokenSentence {
  readonly idx: number;
  readonly paragraphIdx: number;
  readonly kind: ParagraphKind;
  readonly text: string;
  readonly charCount: number;
}

export class SpokenTextGate {
  private readonly finals = new Map<number, string>();
  private readonly known: ReadonlySet<number>;
  private waiters: (() => void)[] = [];

  constructor(private readonly sources: readonly SpokenSource[]) {
    this.known = new Set(sources.map((s) => s.idx));
  }

  /**
   * Publishes final text. Publishing the same sentence again is allowed only with the same text,
   * because a changed sentence would change the segments built on it.
   */
  publish(texts: ReadonlyMap<number, string>): void {
    for (const [idx, text] of texts) {
      if (!this.known.has(idx)) throw new RangeError(`sentence ${idx} is not in this chapter`);
      const existing = this.finals.get(idx);
      if (existing !== undefined && existing !== text) {
        throw new Error(`sentence ${idx} is already final with different text`);
      }
      this.finals.set(idx, text);
    }
    this.notify();
  }

  /** The contiguous final sentences from the start of the chapter, in reading order. */
  prefix(): SpokenSentence[] {
    const out: SpokenSentence[] = [];
    for (const source of this.sources) {
      const text = this.finals.get(source.idx);
      if (text === undefined) break;
      const trimmed = text.trim();
      out.push({
        idx: source.idx,
        paragraphIdx: source.paragraphIdx,
        kind: source.kind,
        text: trimmed,
        charCount: countCodePoints(trimmed),
      });
    }
    return out;
  }

  /** True when every sentence is final, so nothing more will change. */
  get complete(): boolean {
    return this.finals.size === this.sources.length;
  }

  /**
   * The characters the chapter will speak: final text where it is final, and the source text
   * elsewhere. It is an estimate until the chapter is complete.
   */
  estimatedChars(): number {
    let total = 0;
    for (const source of this.sources) {
      total += countCodePoints((this.finals.get(source.idx) ?? source.text).trim());
    }
    return total;
  }

  /** Resolves on the next publish, or rejects when `signal` aborts. */
  waitForChange(signal: AbortSignal): Promise<void> {
    return untilSettled(
      new Promise<void>((resolve) => {
        this.waiters.push(resolve);
      }),
      signal,
    );
  }

  private notify(): void {
    const waiting = this.waiters;
    this.waiters = [];
    for (const resolve of waiting) resolve();
  }
}

import { z } from 'zod';

import { SELECTION_SYSTEM_PROMPT } from './prompts';

import type { Block } from './types';

/** Each block is cut to this many characters in the prompt. The full text stays local. */
export const PROMPT_BLOCK_CHARS = 300;
/** A selection that would drop more than this share of the characters is refused. */
export const MAX_DROPPED_CHAR_SHARE = 0.7;
const MAX_KEEP_INDICES = 10_000;

export const selectionSchema = z.object({
  keep: z.array(z.number().int().nonnegative()).max(MAX_KEEP_INDICES),
});

export type Selection = z.infer<typeof selectionSchema>;

export interface SelectionPromptMeta {
  title?: string | null;
  lang?: string | null;
}

export interface SelectionPrompt {
  system: string;
  user: string;
}

export interface SelectionOutcome {
  blocks: Block[];
  applied: boolean;
  /** Set when the selection was refused and the original blocks were returned. */
  warning: string | null;
}

function truncateChars(text: string, limit: number): string {
  const chars = Array.from(text);
  return chars.length <= limit ? text : `${chars.slice(0, limit).join('')}…`;
}

/** Builds the numbered-block prompt. Each line is `[index] text`, cut to `PROMPT_BLOCK_CHARS`. */
export function buildSelectionPrompt(
  blocks: readonly Block[],
  meta: SelectionPromptMeta = {},
): SelectionPrompt {
  const lines = blocks.map(
    (block, index) => `[${index}] ${truncateChars(block.text, PROMPT_BLOCK_CHARS)}`,
  );
  const user = [
    `Title: ${meta.title?.trim() || 'unknown'}`,
    `Language hint: ${meta.lang?.trim() || 'unknown'}`,
    'Blocks:',
    ...lines,
  ].join('\n');
  return { system: SELECTION_SYSTEM_PROMPT, user };
}

const FENCED_JSON = /```(?:json)?\s*([\s\S]*?)```/;

/**
 * Parses a model reply into a validated selection. A reply wrapped in a Markdown code fence is
 * accepted. Anything else that fails JSON or schema validation returns null.
 */
export function parseSelectionResponse(raw: string): Selection | null {
  const fenced = FENCED_JSON.exec(raw);
  const payload = fenced?.[1] ?? raw;
  let json: unknown;
  try {
    json = JSON.parse(payload.trim());
  } catch {
    return null;
  }
  const parsed = selectionSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

function charCount(blocks: readonly Block[]): number {
  return blocks.reduce((sum, block) => sum + block.text.length, 0);
}

/**
 * Applies a model's keep list. Out-of-range and duplicate indices are ignored, and the original
 * order is kept. If the selection would drop more than 70% of the characters, the original blocks
 * are returned with a warning, so the model cannot blank a chapter.
 */
export function applySelection(
  blocks: readonly Block[],
  keep: readonly number[],
): SelectionOutcome {
  const wanted = new Set(keep.filter((i) => Number.isInteger(i) && i >= 0 && i < blocks.length));
  const kept = blocks.filter((_, index) => wanted.has(index));

  const total = charCount(blocks);
  const dropped = total - charCount(kept);
  if (total > 0 && dropped > MAX_DROPPED_CHAR_SHARE * total) {
    return { blocks: [...blocks], applied: false, warning: 'selection_dropped_too_much' };
  }
  return { blocks: kept, applied: true, warning: null };
}

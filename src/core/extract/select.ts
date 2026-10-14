import { z } from 'zod';

import { SELECTION_SYSTEM_PROMPT } from './prompts';
import { parseJsonReply } from '../llm/json';
import { estimateTokens } from '../text/chunk';

import type { Block } from './types';

/** Each block is cut to this many characters in the prompt. The full text stays local. */
export const PROMPT_BLOCK_CHARS = 300;
/** A selection that would drop more than this share of the characters is refused. */
export const MAX_DROPPED_CHAR_SHARE = 0.7;
const MAX_KEEP_INDICES = 10_000;
/** Prompt tokens of blocks sent in one selection call. Each call stays far inside the model's context. */
export const SELECTION_CHUNK_TOKENS = 6_000;
/** A page that needs more calls than this is refused, so a huge noisy page never runs up a bill. */
export const MAX_SELECTION_CHUNKS = 12;
/** The copy when a page is too noisy or too long for the cleanup pass. Names the way out. */
export const TOO_LARGE_TO_READ = "This page is too large to read. Try the article's own link or a PDF.";
/** Tokens the `[index] ` prefix of each prompt line adds. */
const LINE_PREFIX_TOKENS = 4;

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

/**
 * Parses a model reply into a validated selection. A reply wrapped in a Markdown code fence is
 * accepted. Anything else that fails JSON or schema validation returns null.
 */
export function parseSelectionResponse(raw: string): Selection | null {
  const json = parseJsonReply(raw);
  if (!json.ok) return null;
  const parsed = selectionSchema.safeParse(json.value);
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

/** One block that goes to the model, with its index in the page's full block list. */
export interface ChunkItem {
  readonly index: number;
  readonly block: Block;
}

/**
 * Splits the blocks that carry text into consecutive chunks, each within `budgetTokens` of prompt.
 * Blocks with no text are dropped first, since they have nothing to select. Each item keeps its
 * index in the full list, so the model's keep list maps back to the page whichever chunk it is in.
 */
export function chunkForSelection(
  blocks: readonly Block[],
  budgetTokens: number = SELECTION_CHUNK_TOKENS,
): ChunkItem[][] {
  const chunks: ChunkItem[][] = [];
  let current: ChunkItem[] = [];
  let currentTokens = 0;
  blocks.forEach((block, index) => {
    if (block.text.trim() === '') return;
    const tokens = estimateTokens(truncateChars(block.text, PROMPT_BLOCK_CHARS)) + LINE_PREFIX_TOKENS;
    if (current.length > 0 && currentTokens + tokens > budgetTokens) {
      chunks.push(current);
      current = [];
      currentTokens = 0;
    }
    current.push({ index, block });
    currentTokens += tokens;
  });
  if (current.length > 0) chunks.push(current);
  return chunks;
}

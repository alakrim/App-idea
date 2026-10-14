import type { ChapterMemoryRecord } from '@/core/analysis/types';
import type {
  Chapter,
  IdGenerator,
  Lang,
  PlaybackPoint,
  QaMessage,
  SentenceRef,
} from '@/core/domain';
import { buildPriorContext } from '@/core/memory/codex';
import { paidCallEntry } from '@/core/llm/usage-entry';
import { buildQaPrompt } from '@/core/memory/qa';
import type { QaFtsHit } from '@/core/memory/qa';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { memoryRepo } from '@/db/repos/memory-repo';
import { positionRepo } from '@/db/repos/position-repo';
import { qaRepo } from '@/db/repos/qa-repo';
import { textRepo } from '@/db/repos/text-repo';
import { usageRepo } from '@/db/repos/usage-repo';
import type { Db } from '@/db/types';
import type { OpenRouterClient } from '@/services/openrouter';
import { pipelineFailure } from '@/services/openrouter/errors';

import { citedChapterNumbers } from './citations';
import { extractKeywords } from './keywords';

/** Spoiler cutoff is the furthest position. Nothing past it is ever read into a prompt. */
export const NO_POSITION_MESSAGE =
  "Start listening to this series first, and I'll answer from what you've heard.";

/** Token budget for the series codex (entities and chapter summaries before the cutoff). */
export const QA_CODEX_BUDGET_TOKENS = 3000;
const PASSAGES_PER_KEYWORD = 6;
const MAX_PASSAGES = 12;
const ANSWER_MAX_TOKENS = 700;
const ANSWER_TEMPERATURE = 0.2;

export interface AskDeps {
  readonly db: Db;
  readonly openrouter: Pick<OpenRouterClient, 'chatText'>;
  readonly now: () => number;
  readonly newId: IdGenerator;
}

export interface AskRequest {
  readonly seriesId: string;
  readonly question: string;
  /** The analysis model from settings. */
  readonly model: string;
  /** The UI language. The answer is written in it. */
  readonly lang: Lang;
  readonly signal?: AbortSignal;
}

export type AskResult =
  | { readonly kind: 'no-position' }
  | { readonly kind: 'answered'; readonly user: QaMessage; readonly assistant: QaMessage };

interface GatheredContext {
  readonly chapters: readonly Chapter[];
  readonly codex: string;
  readonly memories: ChapterMemoryRecord[];
  readonly hits: QaFtsHit[];
}

/**
 * Builds everything the model may see, all bounded by the cutoff. Memory cards and facts come only
 * from chapters strictly before the cutoff chapter. Passages come from the cutoff chapter up to the
 * cutoff sentence. The prompt builder applies the same rules again as a second line of defence.
 */
function gatherContext(
  db: Db,
  seriesId: string,
  question: string,
  cutoff: PlaybackPoint,
): GatheredContext {
  const chapters = chapterRepo.listBySeries(db, seriesId);
  const numberByOrder = new Map(chapters.map((chapter, index) => [chapter.order, index + 1]));
  const entities = memoryRepo.listEntities(db, seriesId);
  const facts = memoryRepo.listFactsBefore(db, seriesId, cutoff.chapterOrder);
  const memories = memoryRepo.listMemoriesBefore(db, seriesId, cutoff.chapterOrder);
  const codex = buildPriorContext(
    entities,
    facts,
    memories,
    cutoff.chapterOrder,
    QA_CODEX_BUDGET_TOKENS,
  );

  const names = entities.flatMap((entity) => [entity.canonicalName, ...entity.aliases]);
  const keywords = extractKeywords(question, names);
  const hits = searchPassages(db, seriesId, cutoff, keywords, numberByOrder);

  return { chapters, codex, memories, hits };
}

function searchPassages(
  db: Db,
  seriesId: string,
  cutoff: PlaybackPoint,
  keywords: readonly string[],
  numberByOrder: ReadonlyMap<number, number>,
): QaFtsHit[] {
  const found = new Map<string, QaFtsHit>();
  const cutoffRef: SentenceRef = { chapterId: cutoff.chapterId, idx: cutoff.sentenceIdx };
  for (const keyword of keywords) {
    const hits = textRepo.search(db, {
      seriesId,
      cutoff: cutoffRef,
      query: keyword,
      limit: PASSAGES_PER_KEYWORD,
    });
    for (const hit of hits) {
      const key = `${hit.chapterOrder}:${hit.idx}`;
      const chapterNumber = numberByOrder.get(hit.chapterOrder);
      if (found.has(key) || chapterNumber === undefined) continue;
      found.set(key, {
        chapterOrder: hit.chapterOrder,
        chapterNumber,
        sentenceIdx: hit.idx,
        text: hit.text,
      });
      if (found.size >= MAX_PASSAGES) return [...found.values()];
    }
  }
  return [...found.values()];
}

/**
 * Turns "(Ch. N)" markers into citations. A citation is kept only when its chapter is at or before
 * the cutoff, so an answer can never point at a chapter the reader has not reached.
 */
function citationsFor(
  answer: string,
  chapters: readonly Chapter[],
  hits: readonly QaFtsHit[],
  cutoff: PlaybackPoint,
): SentenceRef[] {
  const refs: SentenceRef[] = [];
  for (const number of citedChapterNumbers(answer)) {
    const chapter = chapters[number - 1];
    if (!chapter || chapter.order > cutoff.chapterOrder) continue;
    const firstHit = hits.find((hit) => hit.chapterNumber === number);
    refs.push({ chapterId: chapter.id, idx: firstHit?.sentenceIdx ?? 0 });
  }
  return refs;
}

/**
 * Answers one question from what the listener has heard. With no position row there is no cutoff,
 * so nothing is sent and nothing is stored. Both messages and the usage entry are written in one
 * transaction after the model replies, so a failed call leaves no half-written thread.
 */
export async function askQuestion(deps: AskDeps, request: AskRequest): Promise<AskResult> {
  const { db } = deps;
  const question = request.question.trim();
  if (question === '') throw new Error('A question must not be empty.');

  const position = positionRepo.get(db, request.seriesId);
  if (position === null) return { kind: 'no-position' };
  const cutoff = position.furthest;

  const context = gatherContext(db, request.seriesId, question, cutoff);
  const prompt = buildQaPrompt({
    question,
    cutoff: { chapterOrder: cutoff.chapterOrder, sentenceIdx: cutoff.sentenceIdx },
    codex: context.codex,
    memories: context.memories,
    ftsHits: context.hits,
    lang: request.lang,
  });

  const reply = await deps.openrouter.chatText({
    model: request.model,
    system: prompt.system,
    user: prompt.user,
    temperature: ANSWER_TEMPERATURE,
    maxTokens: ANSWER_MAX_TOKENS,
    signal: request.signal,
  });
  const answer = reply.text.trim();
  if (answer === '') {
    throw pipelineFailure('CONTENT_EMPTY', 'The answer came back empty. Try asking again.', {
      retryable: true,
    });
  }

  const createdAt = deps.now();
  const base = {
    seriesId: request.seriesId,
    cutoffChapterOrder: cutoff.chapterOrder,
    cutoffSentenceIdx: cutoff.sentenceIdx,
  };
  const user: QaMessage = {
    ...base,
    id: deps.newId(),
    role: 'user',
    content: question,
    citations: [],
    createdAt,
  };
  const assistant: QaMessage = {
    ...base,
    id: deps.newId(),
    role: 'assistant',
    content: answer,
    citations: citationsFor(answer, context.chapters, context.hits, cutoff),
    createdAt,
  };

  db.transaction((tx) => {
    qaRepo.append(tx, user);
    qaRepo.append(tx, assistant);
    usageRepo.insert(
      tx,
      paidCallEntry({
        id: deps.newId(),
        at: createdAt,
        chapterId: null,
        stage: 'qa',
        model: reply.model,
        promptTokens: reply.usage.promptTokens,
        completionTokens: reply.usage.completionTokens,
        costUsd: reply.usage.costUsd,
        generationId: reply.generationId,
      }),
    );
  });

  return { kind: 'answered', user, assistant };
}

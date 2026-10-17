import type { MemoryFields } from '@/core/analysis/types';
import type { Entity, EntityFact, IdGenerator } from '@/core/domain';
import { chapterRow, chapterText, id, seriesRow, T0 } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { memoryRepo } from '@/db/repos/memory-repo';
import { positionRepo } from '@/db/repos/position-repo';
import { qaRepo } from '@/db/repos/qa-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { textRepo } from '@/db/repos/text-repo';
import { usageRepo } from '@/db/repos/usage-repo';
import { listeningPositions } from '@/db/schema';
import type { Db } from '@/db/types';
import type { ChatTextInput, ChatTextResult } from '@/services/openrouter/chat';
import { PipelineFailure } from '@/services/openrouter/errors';

import { askQuestion, NO_POSITION_MESSAGE } from './ask-service';

/**
 * Spoiler tests. The reader is in chapter 2 at sentence 1. Chapter 3 is entirely in the future.
 * Every marker that starts with SECRET must never reach the prompt sent to the model.
 */
const SERIES = id(1);
const CUTOFF_CHAPTER = id(2);
const CUTOFF_SENTENCE = 1;

function fields(summary: string, keyEvents: string[] = []): MemoryFields {
  return {
    summary,
    keyEvents,
    characters: [],
    places: [],
    items: [],
    relationships: [],
    openThreads: [],
    glossary: [],
  };
}

function seedBook(db: Db): void {
  seriesRepo.insert(db, seriesRow(1, { title: 'The Jade Lantern' }));
  chapterRepo.insert(db, chapterRow(1, 1, 1));
  chapterRepo.insert(db, chapterRow(2, 1, 2));
  chapterRepo.insert(db, chapterRow(3, 1, 3));

  textRepo.replaceChapterText(
    db,
    id(1),
    chapterText(1, ['Lin Mo trained at the temple.', 'Master Wen taught him the Master arts.']),
  );
  textRepo.replaceChapterText(
    db,
    id(2),
    chapterText(2, [
      'Lin Mo found an old scroll.',
      'The scroll named his Master.',
      'AFTER_CUTOFF_SENTENCE Lin Mo left the temple at night.',
    ]),
  );
  textRepo.replaceChapterText(
    db,
    id(3),
    chapterText(3, ['FUTURE_TEXT_SECRET the Master confessed everything.']),
  );

  memoryRepo.saveMemory(db, {
    chapterId: id(1),
    memory: fields('Ch1 summary: Lin Mo trains with Master Wen.'),
    model: 'm',
    promptVersion: 'v',
    updatedAt: T0,
  });
  memoryRepo.saveMemory(db, {
    chapterId: id(2),
    memory: fields('CURRENT_CARD_SECRET the current chapter ending.', ['CURRENT_EVENT_SECRET']),
    model: 'm',
    promptVersion: 'v',
    updatedAt: T0,
  });
  memoryRepo.saveMemory(db, {
    chapterId: id(3),
    memory: fields('FUTURE_CARD_SECRET the final reveal.'),
    model: 'm',
    promptVersion: 'v',
    updatedAt: T0,
  });

  const lin: Entity = {
    id: id(101),
    seriesId: SERIES,
    kind: 'character',
    canonicalName: 'Lin Mo',
    aliases: [],
    aliasReveals: [],
    firstChapterOrder: 1,
  };
  const wen: Entity = {
    id: id(102),
    seriesId: SERIES,
    kind: 'character',
    canonicalName: 'Master Wen',
    aliases: ['Wen'],
    aliasReveals: [{ alias: 'Wen', firstChapterOrder: 1 }],
    firstChapterOrder: 1,
  };
  const fact = (n: number, chapterN: number, order: number, text: string): EntityFact => ({
    id: id(200 + n),
    entityId: id(101),
    chapterId: id(chapterN),
    chapterOrder: order,
    fact: text,
  });
  memoryRepo.saveEntityResolution(db, SERIES, {
    upserts: [lin, wen],
    newFacts: [
      fact(1, 1, 1, 'Trained under Master Wen'),
      fact(2, 2, 2, 'CURRENT_FACT_SECRET hides the scroll'),
      fact(3, 3, 3, 'FUTURE_FACT_SECRET is the traitor'),
    ],
  });

  positionRepo.record(
    db,
    SERIES,
    { chapterId: CUTOFF_CHAPTER, sentenceIdx: CUTOFF_SENTENCE, positionMs: 0 },
    T0,
  );
}

function fakeClient(answer: string | ((input: ChatTextInput) => string)) {
  const chatText = jest.fn(async (input: ChatTextInput): Promise<ChatTextResult> => ({
    text: typeof answer === 'string' ? answer : answer(input),
    usage: { promptTokens: 120, completionTokens: 30, costUsd: 0.002 },
    generationId: 'gen-1',
    model: input.model,
  }));
  return { chatText };
}

function ids(): IdGenerator {
  let n = 0;
  return () => id(5000 + n++);
}

function deps(db: Db, client: ReturnType<typeof fakeClient>) {
  return { db, openrouter: client, now: () => T0 + 1000, newId: ids() };
}

const REQUEST = {
  seriesId: SERIES,
  model: 'anthropic/test',
  lang: 'en',
} as const;

describe('askQuestion spoiler cutoff', () => {
  it('sends only memories and facts from before the cutoff chapter', async () => {
    const { db } = createTestDb();
    seedBook(db);
    const client = fakeClient('Master Wen trained him (Ch. 1).');

    await askQuestion(deps(db, client), { ...REQUEST, question: 'Who is Lin Mo master?' });

    const sent = client.chatText.mock.calls[0]?.[0].user ?? '';
    expect(sent).toContain('Ch1 summary: Lin Mo trains with Master Wen.');
    expect(sent).toContain('Trained under Master Wen');
  });

  it('never sends the cutoff chapter memory card or its facts', async () => {
    const { db } = createTestDb();
    seedBook(db);
    const client = fakeClient('Not revealed yet.');

    await askQuestion(deps(db, client), { ...REQUEST, question: 'What is the scroll hiding?' });

    const sent = client.chatText.mock.calls[0]?.[0].user ?? '';
    expect(sent).not.toContain('CURRENT_CARD_SECRET');
    expect(sent).not.toContain('CURRENT_EVENT_SECRET');
    expect(sent).not.toContain('CURRENT_FACT_SECRET');
  });

  it('never sends a fact, memory or passage from a chapter after the cutoff', async () => {
    const { db } = createTestDb();
    seedBook(db);
    const client = fakeClient('Not revealed yet.');

    await askQuestion(deps(db, client), {
      ...REQUEST,
      question: 'Who is the traitor and what did the Master confess?',
    });

    const sent = client.chatText.mock.calls[0]?.[0].user ?? '';
    expect(sent).not.toContain('FUTURE_');
    expect(sent).not.toContain('SECRET');
  });

  it('never sends passages from the cutoff chapter after the cutoff sentence', async () => {
    const { db } = createTestDb();
    seedBook(db);
    const client = fakeClient('Not revealed yet.');

    await askQuestion(deps(db, client), { ...REQUEST, question: 'What did Lin Mo do at night?' });

    const sent = client.chatText.mock.calls[0]?.[0].user ?? '';
    expect(sent).not.toContain('AFTER_CUTOFF_SENTENCE');
  });

  it('sends passages up to and including the cutoff sentence', async () => {
    const { db } = createTestDb();
    seedBook(db);
    const client = fakeClient('The scroll named his Master (Ch. 2).');

    await askQuestion(deps(db, client), { ...REQUEST, question: 'What did the scroll name?' });

    const sent = client.chatText.mock.calls[0]?.[0].user ?? '';
    expect(sent).toContain('(Ch. 2) The scroll named his Master.');
  });

  it('drops citations to chapters after the cutoff', async () => {
    const { db } = createTestDb();
    seedBook(db);
    const client = fakeClient('Wen trained him (Ch. 1). The traitor is revealed (Ch. 3).');

    const result = await askQuestion(deps(db, client), {
      ...REQUEST,
      question: 'Who trained Lin Mo?',
    });

    expect(result.kind).toBe('answered');
    if (result.kind !== 'answered') return;
    expect(result.assistant.citations).toEqual([{ chapterId: id(1), idx: 0 }]);
  });
});

describe('askQuestion without a position', () => {
  it('answers nothing, sends nothing and stores nothing', async () => {
    const { db } = createTestDb();
    seedBook(db);
    db.delete(listeningPositions).run();
    const client = fakeClient('should not be used');

    const result = await askQuestion(deps(db, client), { ...REQUEST, question: 'Who is Lin Mo?' });

    expect(result).toEqual({ kind: 'no-position' });
    expect(client.chatText).not.toHaveBeenCalled();
    expect(qaRepo.listForSeries(db, SERIES)).toEqual([]);
    expect(NO_POSITION_MESSAGE).toMatch(/Start listening/);
  });
});

describe('askQuestion persistence', () => {
  it('stores the question, the answer with its cutoff, and a qa usage entry', async () => {
    const { db } = createTestDb();
    seedBook(db);
    const client = fakeClient('Wen trained him (Ch. 1).');

    const result = await askQuestion(deps(db, client), {
      ...REQUEST,
      question: 'Who trained Lin Mo?',
    });

    expect(result.kind).toBe('answered');
    const thread = qaRepo.listForSeries(db, SERIES);
    expect(thread.map((m) => m.role)).toEqual(['user', 'assistant']);
    expect(thread[1]).toMatchObject({
      content: 'Wen trained him (Ch. 1).',
      cutoffChapterOrder: 2,
      cutoffSentenceIdx: CUTOFF_SENTENCE,
    });
    expect(usageRepo.totalsBy(db, 'model')).toEqual([
      {
        key: 'anthropic/test',
        calls: 1,
        promptTokens: 120,
        completionTokens: 30,
        costUsd: 0.002,
        unknownCalls: 0,
      },
    ]);
  });

  it('calls the model with the analysis model, the answer language and no cached state', async () => {
    const { db } = createTestDb();
    seedBook(db);
    const client = fakeClient('Answer (Ch. 1).');

    await askQuestion(deps(db, client), { ...REQUEST, lang: 'it', question: 'Who is Wen?' });

    const call = client.chatText.mock.calls[0]?.[0];
    expect(call?.model).toBe('anthropic/test');
    expect(call?.user).toContain('Answer language: it');
    expect(call?.system).toContain('Use only the NOTES');
  });

  it('stores nothing when the model fails, so the thread never holds half a turn', async () => {
    const { db } = createTestDb();
    seedBook(db);
    const client = {
      chatText: jest.fn(async (_input: ChatTextInput): Promise<ChatTextResult> => {
        throw new PipelineFailure({ code: 'NETWORK', message: 'offline', retryable: true });
      }),
    };

    await expect(
      askQuestion(deps(db, client), { ...REQUEST, question: 'Who is Wen?' }),
    ).rejects.toMatchObject({ error: { code: 'NETWORK' } });
    expect(qaRepo.listForSeries(db, SERIES)).toEqual([]);
  });

  it('treats an empty answer as a retryable failure and stores nothing', async () => {
    const { db } = createTestDb();
    seedBook(db);

    await expect(
      askQuestion(deps(db, fakeClient('   ')), { ...REQUEST, question: 'Who is Wen?' }),
    ).rejects.toMatchObject({ error: { code: 'CONTENT_EMPTY', retryable: true } });
    expect(qaRepo.listForSeries(db, SERIES)).toEqual([]);
  });

  it('rejects an empty question before any call', async () => {
    const { db } = createTestDb();
    seedBook(db);
    const client = fakeClient('x');

    await expect(askQuestion(deps(db, client), { ...REQUEST, question: '  ' })).rejects.toThrow(
      /must not be empty/,
    );
    expect(client.chatText).not.toHaveBeenCalled();
  });
});

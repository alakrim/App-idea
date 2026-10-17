import { DEFAULT_SETTINGS } from '@/core/defaults';
import { chapterRow, chapterText, id, seriesRow, T0 } from '@/db/__fixtures__/factories';
import { createTestDb } from '@/db/__fixtures__/test-db';
import { chapterRepo } from '@/db/repos/chapter-repo';
import { seriesRepo } from '@/db/repos/series-repo';
import { textRepo } from '@/db/repos/text-repo';
import { usageRepo } from '@/db/repos/usage-repo';
import { vocabRepo } from '@/db/repos/vocab-repo';
import type { Db } from '@/db/types';
import type { ChatJsonInput, ChatJsonResult } from '@/services/openrouter/chat';
import { PipelineFailure } from '@/services/openrouter/errors';

import { createVocabActions, MAX_TERM_LENGTH } from './vocab-actions';

const REPLY = {
  term: 'bellissimo',
  lemma: 'bellissimo',
  partOfSpeech: 'adjective',
  translation: 'beautiful',
  explanation: 'Very beautiful, used for things that look wonderful.',
  example: null,
};

function result(): ChatJsonResult<typeof REPLY> {
  return {
    data: REPLY,
    usage: { promptTokens: 80, completionTokens: 20, costUsd: 0.001 },
    generationId: 'gen-vocab',
    model: 'anthropic/test',
  };
}

function seed(): Db {
  const { db } = createTestDb();
  seriesRepo.insert(db, seriesRow(1, { sourceLang: 'en', targetLang: 'it' }));
  chapterRepo.insert(db, chapterRow(1, 1, 1));
  textRepo.replaceChapterText(db, id(1), chapterText(1, ['Il tramonto era bellissimo.']));
  return db;
}

function harness(db: Db, chatJson: jest.Mock) {
  let n = 0;
  return createVocabActions({
    db,
    openrouter: { chatJson } as never,
    getSettings: () => ({ ...DEFAULT_SETTINGS, uiLanguage: 'en' }),
    now: () => T0 + 5,
    newId: () => id(700 + n++),
  });
}

/** A promise the test resolves by hand, to observe the state between save and explanation. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('vocab save and explanation', () => {
  it('stores the item at once, before the explanation arrives', () => {
    const db = seed();
    const gate = deferred<ChatJsonResult<typeof REPLY>>();
    const actions = harness(
      db,
      jest.fn(() => gate.promise),
    );

    const savedId = actions.saveToVocab({
      seriesId: id(1),
      chapterId: id(1),
      sentenceIdx: 0,
      text: 'Il tramonto era bellissimo.',
      selection: 'bellissimo',
    });

    expect(vocabRepo.get(db, savedId)).toMatchObject({
      term: 'bellissimo',
      lang: 'it',
      explanation: null,
      translation: null,
    });
    expect(actions.isPending(savedId)).toBe(true);
    gate.resolve(result());
  });

  it('fills the explanation, records the usage and clears the pending state', async () => {
    const db = seed();
    const chatJson = jest.fn(async () => result());
    const actions = harness(db, chatJson);

    const savedId = actions.saveToVocab({
      seriesId: id(1),
      chapterId: id(1),
      sentenceIdx: 0,
      text: 'Il tramonto era bellissimo.',
      selection: 'bellissimo',
    });
    await flush();

    expect(vocabRepo.get(db, savedId)).toMatchObject({
      translation: 'beautiful',
      explanation: 'Very beautiful, used for things that look wonderful.',
    });
    expect(actions.isPending(savedId)).toBe(false);
    expect(actions.failureOf(savedId)).toBeNull();
    expect(usageRepo.totalsBy(db, 'model')).toEqual([
      { key: 'anthropic/test', calls: 1, promptTokens: 80, completionTokens: 20, costUsd: 0.001 },
    ]);
  });

  it('sends the sentence as context with the studied and explanation languages', async () => {
    const db = seed();
    const chatJson = jest.fn(async (_input: ChatJsonInput<unknown>) => result());
    const actions = harness(db, chatJson as jest.Mock);

    actions.saveToVocab({
      seriesId: id(1),
      chapterId: id(1),
      sentenceIdx: 0,
      text: 'Il tramonto era bellissimo.',
      selection: 'bellissimo',
    });
    await flush();

    const call = chatJson.mock.calls[0]?.[0];
    expect(call?.user).toContain('Studied language: it');
    expect(call?.user).toContain('Explanation language: en');
    expect(call?.user).toContain('Sentence: Il tramonto era bellissimo.');
    expect(call?.schema).toBeDefined();
  });

  it('keeps the item when the explanation fails, shows why, and retries on request', async () => {
    const db = seed();
    const chatJson = jest
      .fn()
      .mockRejectedValueOnce(
        new PipelineFailure({ code: 'NETWORK', message: 'You are offline.', retryable: true }),
      )
      .mockResolvedValueOnce(result());
    const actions = harness(db, chatJson);

    const savedId = actions.saveToVocab({
      seriesId: id(1),
      chapterId: id(1),
      sentenceIdx: 0,
      text: 'Il tramonto era bellissimo.',
      selection: 'bellissimo',
    });
    await flush();

    expect(vocabRepo.get(db, savedId)).toMatchObject({ term: 'bellissimo', explanation: null });
    expect(actions.failureOf(savedId)).toBe('You are offline.');

    actions.retryExplanation(savedId);
    expect(actions.failureOf(savedId)).toBeNull();
    await flush();

    expect(vocabRepo.get(db, savedId)?.translation).toBe('beautiful');
    expect(chatJson).toHaveBeenCalledTimes(2);
  });

  it('returns the existing item instead of saving the same word twice', () => {
    const db = seed();
    const actions = harness(
      db,
      jest.fn(() => new Promise(() => undefined)),
    );
    const input = {
      seriesId: id(1),
      chapterId: id(1),
      sentenceIdx: 0,
      text: 'Il tramonto era bellissimo.',
      selection: 'bellissimo',
    };

    const first = actions.saveToVocab(input);
    const second = actions.saveToVocab(input);

    expect(second).toBe(first);
    expect(vocabRepo.list(db)).toHaveLength(1);
  });

  it('tells the caller a word is already saved before a second save would find the old entry', () => {
    const db = seed();
    const actions = harness(
      db,
      jest.fn(() => new Promise(() => undefined)),
    );
    const input = {
      seriesId: id(1),
      chapterId: id(1),
      sentenceIdx: 0,
      text: 'Il tramonto era bellissimo.',
      selection: 'bellissimo',
    };

    expect(actions.hasSaved(input)).toBe(false);
    actions.saveToVocab(input);

    expect(actions.hasSaved(input)).toBe(true);
    expect(actions.hasSaved({ ...input, sentenceIdx: 1 })).toBe(false);
  });

  it('saves the whole sentence, clipped, when nothing is selected', () => {
    const db = seed();
    const actions = harness(
      db,
      jest.fn(() => new Promise(() => undefined)),
    );

    const savedId = actions.saveToVocab({
      seriesId: id(1),
      chapterId: id(1),
      sentenceIdx: 0,
      text: 'x'.repeat(MAX_TERM_LENGTH + 40),
      selection: '   ',
    });

    expect(vocabRepo.get(db, savedId)?.term).toHaveLength(MAX_TERM_LENGTH);
  });

  it('refuses an empty save before writing anything', () => {
    const db = seed();
    const actions = harness(db, jest.fn());

    expect(() =>
      actions.saveToVocab({ seriesId: id(1), chapterId: id(1), sentenceIdx: 0, text: '  ' }),
    ).toThrow(/Select a word or phrase/);
    expect(vocabRepo.list(db)).toEqual([]);
  });

  it('falls back to the source language when a series has no target language', () => {
    const db = seed();
    seriesRepo.update(db, id(1), { targetLang: null });
    const actions = harness(
      db,
      jest.fn(() => new Promise(() => undefined)),
    );

    const savedId = actions.saveToVocab({
      seriesId: id(1),
      chapterId: id(1),
      sentenceIdx: 0,
      text: 'bellissimo',
    });

    expect(vocabRepo.get(db, savedId)?.lang).toBe('en');
  });

  it('notifies subscribers when a pending state changes', async () => {
    const db = seed();
    const actions = harness(
      db,
      jest.fn(async () => result()),
    );
    const listener = jest.fn();
    const unsubscribe = actions.subscribe(listener);
    const before = actions.getVersion();

    actions.saveToVocab({
      seriesId: id(1),
      chapterId: id(1),
      sentenceIdx: 0,
      text: 'bellissimo',
    });
    await flush();

    expect(listener).toHaveBeenCalled();
    expect(actions.getVersion()).toBeGreaterThan(before);
    unsubscribe();
  });
});

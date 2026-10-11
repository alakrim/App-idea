import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { QaMessageSchema, SentenceRefSchema } from '../../core/domain';
import { parseJsonColumn } from '../json-column';
import { qaMessages } from '../schema';

import type { QaMessage } from '../../core/domain';
import type { Db } from '../types';

type QaRow = typeof qaMessages.$inferSelect;

/** Most recent messages returned by `listForSeries` unless a caller asks for fewer. */
const DEFAULT_HISTORY_LIMIT = 200;

function toMessage(row: QaRow): QaMessage {
  return QaMessageSchema.parse({
    ...row,
    citations: parseJsonColumn(z.array(SentenceRefSchema), row.citations, {
      table: 'qa_messages',
      column: 'citations',
      id: row.id,
    }),
  });
}

export const qaRepo = {
  /** Appends one message to a series' thread. Messages are never edited. */
  append(db: Db, message: QaMessage): void {
    const row = QaMessageSchema.parse(message);
    db.insert(qaMessages)
      .values({ ...row, citations: JSON.stringify(row.citations) })
      .run();
  },

  /** The latest messages of a series' thread, oldest first. */
  listForSeries(db: Db, seriesId: string, limit = DEFAULT_HISTORY_LIMIT): QaMessage[] {
    return db
      .select()
      .from(qaMessages)
      .where(eq(qaMessages.seriesId, seriesId))
      .orderBy(desc(qaMessages.createdAt), desc(qaMessages.id))
      .limit(limit)
      .all()
      .map(toMessage)
      .reverse();
  },
};

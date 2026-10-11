/*
 * JobStore on jobRepo. The chapter queue is kept under the `pipelineQueue` key of the settings
 * table. That key is not a user setting, so the settings repo ignores it. Its entries carry the run
 * options, so a restored queue runs the way it was queued.
 */
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Clock, PersistedQueueItem, JobStore } from '@/core/pipeline/ports';
import { jobRepo } from '@/db/repos/job-repo';
import { settings } from '@/db/schema';
import type { Db } from '@/db/types';

export const QUEUE_SETTING_KEY = 'pipelineQueue';

const QueueEntrySchema = z.object({
  chapterId: z.string().min(1),
  from: z.enum(['extract', 'clean', 'segment', 'analyze', 'translate', 'narrate']).optional(),
  force: z.boolean().optional(),
  pdfEngine: z.enum(['cloudflare-ai', 'mistral-ocr']).optional(),
});

const QueueSchema = z.array(z.unknown());

export interface JobStoreDeps {
  readonly db: Db;
  readonly clock: Clock;
}

export function createJobStore({ db, clock }: JobStoreDeps): JobStore {
  return {
    async get(chapterId, stage) {
      return jobRepo.get(db, chapterId, stage);
    },

    async upsert(job) {
      jobRepo.upsert(db, job);
    },

    async cancelUnfinished(chapterId) {
      jobRepo.cancelUnfinished(db, chapterId, clock.now());
    },

    async loadQueue(): Promise<PersistedQueueItem[]> {
      const row = db.select().from(settings).where(eq(settings.key, QUEUE_SETTING_KEY)).get();
      if (!row) return [];
      const json = parseJson(row.value);
      const list = QueueSchema.safeParse(json);
      if (!list.success) return [];
      // A malformed entry is dropped on its own, so one bad row cannot empty the whole queue.
      return list.data.flatMap((entry) => {
        const parsed = QueueEntrySchema.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      });
    },

    async saveQueue(items) {
      const value = JSON.stringify(items.map((item) => QueueEntrySchema.parse(item)));
      const updatedAt = clock.now();
      db.insert(settings)
        .values({ key: QUEUE_SETTING_KEY, value, updatedAt })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt } })
        .run();
    },
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

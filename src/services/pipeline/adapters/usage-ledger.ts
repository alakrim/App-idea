import type { UsageLedger } from '@/core/pipeline/ports';
import { usageRepo } from '@/db/repos/usage-repo';
import type { Db } from '@/db/types';

export function createUsageLedger(db: Db): UsageLedger {
  return {
    async record(entry) {
      usageRepo.insert(db, entry);
    },
  };
}

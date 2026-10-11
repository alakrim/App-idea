// TEMPORARY web-export stub (U2 screenshots only): the real fake pipeline over the stub database.
import { useMemo, type ReactNode } from 'react';
import { useDb } from '@/db/hooks';
import { createFakePipeline } from '@/features/pipeline/fake-facade';
import { PipelineContext } from '@/features/pipeline/facade';

export function PipelineProvider({ children }: { children: ReactNode }) {
  const db = useDb();
  const facade = useMemo(() => createFakePipeline({ db }), [db]);
  return <PipelineContext.Provider value={facade}>{children}</PipelineContext.Provider>;
}

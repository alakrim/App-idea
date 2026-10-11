import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { useDb } from '@/db/hooks';
import type { Db } from '@/db/types';
import { createLectioPipelineRuntime } from '@/services/pipeline';
import type { PipelineRuntime } from '@/services/pipeline';

import { PipelineContext, type PipelineFacade } from './facade';

/** The pipeline the app runs on: the real runtime, on the open database. */
export const createPipeline = (db: Db): PipelineRuntime => createLectioPipelineRuntime(db);

const RuntimeContext = createContext<PipelineRuntime | null>(null);

/** The runtime's queue and boot hooks (restore, resume, events). Null under a test factory. */
export function usePipelineRuntime(): PipelineRuntime | null {
  return useContext(RuntimeContext);
}

export interface PipelineProviderProps {
  children: ReactNode;
  /** Overridable for tests and the dev screens. Defaults to the app's pipeline. */
  factory?: (db: Db) => PipelineRuntime;
}

/** Provides one pipeline per open database. Mount it under DbProvider. */
export function PipelineProvider({ children, factory = createPipeline }: PipelineProviderProps) {
  const db = useDb();
  const runtime = useMemo(() => factory(db), [db, factory]);
  return (
    <RuntimeContext.Provider value={runtime}>
      <PipelineContext.Provider value={runtime.facade as PipelineFacade}>
        {children}
      </PipelineContext.Provider>
    </RuntimeContext.Provider>
  );
}

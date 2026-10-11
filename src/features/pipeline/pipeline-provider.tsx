import { useMemo, type ReactNode } from 'react';

import { useDb } from '@/db/hooks';
import type { Db } from '@/db/types';

import { createFakePipeline } from './fake-facade';
import { PipelineContext, type PipelineFacade } from './facade';

/**
 * The pipeline the app runs on. Brief P2 swaps this one line for the real factory. Feature code
 * only ever sees `usePipeline()`.
 */
export const createPipeline = (db: Db): PipelineFacade => createFakePipeline({ db });

export interface PipelineProviderProps {
  children: ReactNode;
  /** Overridable for tests and the dev screens. Defaults to the app's pipeline. */
  factory?: (db: Db) => PipelineFacade;
}

/** Provides one pipeline per open database. Mount it under DbProvider. */
export function PipelineProvider({ children, factory = createPipeline }: PipelineProviderProps) {
  const db = useDb();
  const facade = useMemo(() => factory(db), [db, factory]);
  return <PipelineContext.Provider value={facade}>{children}</PipelineContext.Provider>;
}

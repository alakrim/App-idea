import type { Stage } from '@/core/domain';

import { analyzeStage } from './analyze';
import { extractStage } from './extract';
import { narrateStage } from './narrate';
import { segmentStage } from './segment';
import { translateStage } from './translate';

export { analyzeStage, extractStage, narrateStage, segmentStage, translateStage };

/** The stages in run order. `clean` is recorded by the extract stage, so it is not listed. */
export const STAGE_ORDER: readonly Stage[] = [
  extractStage,
  segmentStage,
  analyzeStage,
  translateStage,
  narrateStage,
].map((definition) => definition.stage);

import type { Stage } from '@/core/domain';

import { analyzeStage } from './analyze';
import { extractStage } from './extract';
import { narrateStage } from './narrate';
import { segmentStage } from './segment';
import { translateStage } from './translate';

import type { StageDefinition } from '../context';

/** The stages in run order. `clean` is recorded by the extract stage, so it is not listed. */
export const STAGE_DEFINITIONS: readonly StageDefinition[] = [
  extractStage,
  segmentStage,
  analyzeStage,
  translateStage,
  narrateStage,
];

export const STAGE_ORDER: readonly Stage[] = STAGE_DEFINITIONS.map((d) => d.stage);

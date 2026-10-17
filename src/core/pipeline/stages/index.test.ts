import { RUN_STAGES } from '@/core/domain';

import { STAGE_ORDER } from './index';

describe('STAGE_ORDER', () => {
  it('runs the stages in the order the domain lists them, which the diagnostics block also uses', () => {
    expect(STAGE_ORDER).toEqual(RUN_STAGES);
  });
});

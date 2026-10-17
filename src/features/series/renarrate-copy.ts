import { formatUsd } from '@/features/shared/format';

import type { NarrationPrice } from './use-narration-price';

/** The body of the re-generate confirmation. A paid action always says what it costs or why it cannot say. */
export function renarrateMessage(price: NarrationPrice): string {
  switch (price.kind) {
    case 'priced':
      return `About ${formatUsd(price.usd)}. The current audio is replaced.`;
    case 'loading':
      return 'Working out the cost. The current audio is replaced.';
    case 'unknown':
      return "Can't price this right now. The current audio is replaced.";
  }
}

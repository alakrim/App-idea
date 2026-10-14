/*
 * The app's foreground service state: one store for the whole app. The pipeline runtime reports into
 * it through the background runner, and Diagnostics reads it. Its support follows the platform.
 */
import { createForegroundStatus } from '@/services/pipeline/foreground-status';

import { createForegroundService } from './foreground-service';

export const appForegroundStatus = createForegroundStatus(createForegroundService().supported);

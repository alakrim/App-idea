/**
 * Captures fatal JavaScript errors into the crash report before React Native hands them to the native
 * side, which then closes the app (brief X2). `index.js` installs it before expo-router loads, so an
 * error thrown while the bundle starts is captured too.
 *
 * Non-fatal errors are not captured: they are not what closes the app. The previous handler always
 * runs, so development redboxes and release behaviour are unchanged.
 */

/** The signature of React Native's ErrorUtils global handler. */
export type JsErrorHandler = (error: unknown, isFatal?: boolean) => void;

/** The part of React Native's `ErrorUtils` global this module uses. */
export interface ErrorUtilsLike {
  getGlobalHandler(): JsErrorHandler | undefined;
  setGlobalHandler(handler: JsErrorHandler): void;
}

export interface CrashCaptureOptions {
  /** `globalThis.ErrorUtils`. When it is missing, capture is not installed. */
  errorUtils: ErrorUtilsLike | undefined;
  /** Stores the report text. It may throw, and the handler still delegates to the previous one. */
  writeReport: (report: string) => void;
  now?: () => Date;
}

/** The plain-text report for a fatal JavaScript error, in the same file the native side writes. */
export function formatJsCrashReport(error: unknown, at: Date): string {
  const lines = [
    'Lectio crash report',
    'Kind: JavaScript fatal error',
    `Time: ${at.toISOString()}`,
    '',
  ];
  if (error instanceof Error) {
    lines.push(`${error.name}: ${error.message}`);
    if (error.stack) lines.push(error.stack);
    const componentStack = readComponentStack(error);
    if (componentStack) lines.push('', 'Component stack:', componentStack);
  } else {
    lines.push(`Thrown value: ${describeValue(error)}`);
  }
  return lines.join('\n');
}

/**
 * Wraps the previous global handler. A fatal error is written before the previous handler runs, because
 * that handler is what closes the app. Writing never throws into React Native's error path.
 */
export function createFatalErrorHandler(
  previous: JsErrorHandler | undefined,
  writeReport: (report: string) => void,
  now: () => Date,
): JsErrorHandler {
  return (error, isFatal) => {
    if (isFatal === true) {
      try {
        writeReport(formatJsCrashReport(error, now()));
      } catch {
        // Capture is best effort. A failed write must not change how the error is handled.
      }
    }
    previous?.(error, isFatal);
  };
}

/** Installs the capture on `errorUtils`. Does nothing when there is no ErrorUtils global. */
export function installJsCrashCapture(options: CrashCaptureOptions): void {
  const { errorUtils } = options;
  if (!errorUtils) return;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler(
    createFatalErrorHandler(previous, options.writeReport, options.now ?? (() => new Date())),
  );
}

function readComponentStack(error: Error): string | undefined {
  const candidate: unknown = Reflect.get(error, 'componentStack');
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : undefined;
}

function describeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return `[${typeof value}]`;
  }
}

import type * as Pipeline from './pipeline';

/**
 * The page-extraction pipeline (linkedom, Readability and Defuddle) is loaded on the first web page,
 * not at app start. Most sessions never extract a page, so the stack is not evaluated at boot. The
 * module is cached after its first load.
 */
export function loadPipeline(): Promise<typeof Pipeline> {
  return import('./pipeline');
}

import type { CreateGate } from './source-state';

/** Why the Create button is off, in the order the listener fixes things. Null when Create is on. */
export function createBlockedCopy(gate: CreateGate): string | null {
  if (gate.creating) return null;
  if (gate.mode === 'link' && !gate.linkReady) return 'Paste a link to a page with readable text.';
  if (gate.mode === 'pdf' && !gate.hasFile) return 'Choose a PDF to create the chapter.';
  if (gate.mode === 'text' && gate.textLength === 0) return 'Paste the text to create the chapter.';
  if (gate.title.trim() === '') return 'Add a title to create the chapter.';
  return null;
}

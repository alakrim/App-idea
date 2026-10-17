import { untilSettled } from './abort';
import { SpokenTextGate } from './spoken-text';

import type { SpokenSource } from './spoken-text';

const sources: SpokenSource[] = [
  { idx: 0, paragraphIdx: 0, kind: 'text', text: 'One.' },
  { idx: 1, paragraphIdx: 0, kind: 'text', text: '  Two.  ' },
  { idx: 2, paragraphIdx: 1, kind: 'text', text: 'Three.' },
];

function publish(gate: SpokenTextGate, entries: [number, string][]): void {
  gate.publish(new Map(entries));
}

describe('SpokenTextGate: the contiguous prefix', () => {
  it('offers only the run of final sentences from the start, so a gap holds narration back', () => {
    const gate = new SpokenTextGate(sources);
    publish(gate, [
      [0, 'Uno.'],
      [2, 'Tre.'],
    ]);

    expect(gate.prefix().map((s) => s.idx)).toEqual([0]);
    publish(gate, [[1, 'Due.']]);
    expect(gate.prefix().map((s) => s.idx)).toEqual([0, 1, 2]);
  });

  it('trims the text and counts its characters in code points, so an emoji counts once', () => {
    const gate = new SpokenTextGate([{ idx: 0, paragraphIdx: 0, kind: 'text', text: 'x' }]);
    publish(gate, [[0, '  ok 😀  ']]);

    expect(gate.prefix()).toEqual([
      { idx: 0, paragraphIdx: 0, kind: 'text', text: 'ok 😀', charCount: 4 },
    ]);
  });

  it('is complete only when every sentence is final', () => {
    const gate = new SpokenTextGate(sources);
    publish(gate, [
      [0, 'a'],
      [1, 'b'],
    ]);
    expect(gate.complete).toBe(false);
    publish(gate, [[2, 'c']]);
    expect(gate.complete).toBe(true);
  });
});

describe('SpokenTextGate: publishing', () => {
  it('accepts the same text again, so a resumed run can republish what is already final', () => {
    const gate = new SpokenTextGate(sources);
    publish(gate, [[0, 'Uno.']]);
    expect(() => publish(gate, [[0, 'Uno.']])).not.toThrow();
  });

  it('refuses to change a sentence that is already final, because segments are built on it', () => {
    const gate = new SpokenTextGate(sources);
    publish(gate, [[0, 'Uno.']]);
    expect(() => publish(gate, [[0, 'Dos.']])).toThrow(/already final with different text/);
  });

  it('refuses a sentence that is not in the chapter', () => {
    const gate = new SpokenTextGate(sources);
    expect(() => publish(gate, [[9, 'x']])).toThrow(RangeError);
  });
});

describe('SpokenTextGate: the estimate and waiting', () => {
  it('counts the source text where a sentence is not final yet, and the final text where it is', () => {
    const gate = new SpokenTextGate(sources);
    expect(gate.estimatedChars()).toBe('One.'.length + 'Two.'.length + 'Three.'.length);
    publish(gate, [[0, 'Uno translated.']]);
    expect(gate.estimatedChars()).toBe('Uno translated.'.length + 'Two.'.length + 'Three.'.length);
  });

  it('wakes a waiter on the next publish', async () => {
    const gate = new SpokenTextGate(sources);
    const waiting = gate.waitForChange(new AbortController().signal);
    publish(gate, [[0, 'Uno.']]);
    await expect(waiting).resolves.toBeUndefined();
  });

  it('rejects a waiter when its run is cancelled before anything is published', async () => {
    const gate = new SpokenTextGate(sources);
    const controller = new AbortController();
    const waiting = gate.waitForChange(controller.signal);
    controller.abort();
    await expect(waiting).rejects.toThrow();
    // The abort helper it relies on is the one the runner uses for every cancel.
    await expect(untilSettled(Promise.resolve(), controller.signal)).rejects.toThrow();
  });
});

import { planFinalSegments, joinSpoken } from './narrate-plan';

import type { PlanOptions } from './narrate-plan';
import type { SpokenSentence } from '../spoken-text';

const OPTIONS: PlanOptions = {
  maxChars: 600,
  voiceKey: ['openrouter', 'narrator/model', 'Kore', 'Warm.', 1],
};

function sentence(idx: number, text: string, paragraphIdx = idx): SpokenSentence {
  return { idx, paragraphIdx, kind: 'text', text, charCount: [...text].length };
}

/** `count` short Latin sentences, each in its own paragraph, so the plan is easy to predict. */
function latin(count: number, length = 80): SpokenSentence[] {
  return Array.from({ length: count }, (_, n) =>
    sentence(n, `Sentence ${n} `.padEnd(length, 'x') + '.'),
  );
}

describe('planFinalSegments: what is final', () => {
  it('leaves out the open last segment of an incomplete chapter, because later sentences could join it', () => {
    const sentences = latin(12);
    const full = planFinalSegments(sentences, OPTIONS, true);
    const partial = planFinalSegments(sentences, OPTIONS, false);

    expect(partial).toHaveLength(full.length - 1);
    expect(partial).toEqual(full.slice(0, -1));
  });

  it('keeps the last segment of a complete chapter, and it reaches the final sentence', () => {
    const sentences = latin(3);
    const plan = planFinalSegments(sentences, OPTIONS, true);
    expect(plan.at(-1)?.sentenceEnd).toBe(2);
    expect(plan.flatMap((s) => s.sentenceTexts)).toHaveLength(3);
  });

  it('keeps the plan of a prefix as the start of the full plan, at every prefix length', () => {
    const sentences = latin(40);
    const full = planFinalSegments(sentences, OPTIONS, true);
    for (let length = 1; length <= sentences.length; length += 1) {
      const partial = planFinalSegments(sentences.slice(0, length), OPTIONS, false);
      expect(partial).toEqual(full.slice(0, partial.length));
    }
  });
});

describe('planFinalSegments: sizes and the ramp', () => {
  it('makes the first segment short, about 200 characters, and the second about 400', () => {
    const plan = planFinalSegments(latin(40, 60), OPTIONS, true);

    expect(plan[0]?.chars).toBeLessThanOrEqual(200);
    expect(plan[1]?.chars).toBeLessThanOrEqual(400);
    expect(plan[1]?.chars ?? 0).toBeGreaterThan(plan[0]?.chars ?? 0);
    expect(plan.slice(2).every((s) => s.chars <= 600)).toBe(true);
  });

  it('gives a first sentence longer than the ramp its own segment, and never splits it', () => {
    const long = sentence(0, 'A very long sentence. '.repeat(30).trim());
    const plan = planFinalSegments([long, sentence(1, 'Short.')], OPTIONS, true);

    expect(plan[0]).toMatchObject({ sentenceStart: 0, sentenceEnd: 0 });
    expect(plan[0]?.text).toBe(long.text);
  });

  it('plans CJK by its characters, so the first segment is one long sentence', () => {
    const han = Array.from({ length: 3 }, (_, n) =>
      sentence(n, `第${n}句话，很长很长的故事。`.repeat(8)),
    );
    const plan = planFinalSegments(han, OPTIONS, true);
    expect(plan[0]?.sentenceEnd).toBe(0);
  });
});

describe('planFinalSegments: hashes', () => {
  it('gives the same segment the same hash every time, so a rerun can reuse its audio', () => {
    const first = planFinalSegments(latin(10), OPTIONS, true);
    const again = planFinalSegments(latin(10), OPTIONS, true);
    expect(again.map((s) => s.hash)).toEqual(first.map((s) => s.hash));
  });

  it('changes the hash when the voice changes, so every segment is made again', () => {
    const base = planFinalSegments(latin(10), OPTIONS, true);
    const puck = planFinalSegments(
      latin(10),
      { ...OPTIONS, voiceKey: ['openrouter', 'narrator/model', 'Puck', 'Warm.', 1] },
      true,
    );
    expect(puck[0]?.hash).not.toBe(base[0]?.hash);
  });

  it('changes the hash when a sentence changes its text', () => {
    const base = planFinalSegments(latin(3), OPTIONS, true);
    const edited = latin(3);
    edited[1] = sentence(1, 'A different sentence.');
    expect(planFinalSegments(edited, OPTIONS, true)[0]?.hash).not.toBe(base[0]?.hash);
  });
});

describe('joinSpoken', () => {
  it('joins Latin sentences with a space', () => {
    expect(joinSpoken(['One.', 'Two.'])).toBe('One. Two.');
  });

  it('joins CJK sentences with no space between them', () => {
    expect(joinSpoken(['你好。', '世界。'])).toBe('你好。世界。');
  });

  it('returns an empty string for no sentences', () => {
    expect(joinSpoken([])).toBe('');
  });
});

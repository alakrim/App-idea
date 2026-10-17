import { planFinalSegments, joinSpoken } from './narrate-plan';

import type { PlanOptions } from './narrate-plan';
import type { SpokenSentence } from '../spoken-text';

const OPTIONS: PlanOptions = {
  maxChars: 600,
  lang: 'en',
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

/** `count` sentences of one paragraph, each `length` characters of a single repeated glyph. */
function oneParagraph(glyph: string, count: number, length: number): SpokenSentence[] {
  return Array.from({ length: count }, (_, n) => sentence(n, glyph.repeat(length), 0));
}

const rangeOf = (plan: readonly { sentenceStart: number; sentenceEnd: number }[]) =>
  plan.map((s) => [s.sentenceStart, s.sentenceEnd]);

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
  it('makes the first segment about 12 s of speech and the second about 25 s, then the narrator size', () => {
    // Each Latin sentence is 80 characters, about 8.7 s. One fills the first segment, and two the second.
    const plan = planFinalSegments(latin(40), OPTIONS, true);

    expect(rangeOf(plan.slice(0, 3))).toEqual([
      [0, 0],
      [1, 2],
      [3, 9],
    ]);
    expect(plan.slice(2).every((s) => s.chars <= 600)).toBe(true);
  });

  it('measures the ramp in speech, so the same characters fill different first segments by language', () => {
    // Twenty characters each: Latin is about 2.2 s a sentence, Japanese 4.8 s, Mandarin 8 s.
    const latinText = oneParagraph('x', 8, 20);
    const japanese = oneParagraph('あ', 8, 20);
    const mandarin = oneParagraph('汉', 8, 20);

    expect(planFinalSegments(latinText, { ...OPTIONS, lang: 'en' }, true)[0]).toMatchObject({
      sentenceStart: 0,
      sentenceEnd: 4,
    });
    expect(planFinalSegments(japanese, { ...OPTIONS, lang: 'ja' }, true)[0]).toMatchObject({
      sentenceStart: 0,
      sentenceEnd: 1,
    });
    expect(planFinalSegments(mandarin, { ...OPTIONS, lang: 'zh' }, true)[0]).toMatchObject({
      sentenceStart: 0,
      sentenceEnd: 0,
    });
  });

  it('gives a first sentence longer than the ramp its own segment, and never splits it', () => {
    const long = sentence(0, 'A very long sentence. '.repeat(30).trim());
    const plan = planFinalSegments([long, sentence(1, 'Short.')], OPTIONS, true);

    expect(plan[0]).toMatchObject({ sentenceStart: 0, sentenceEnd: 0 });
    expect(plan[0]?.text).toBe(long.text);
  });

  it('keeps a Mandarin first segment to one sentence even when it is far longer than 12 s', () => {
    const han = Array.from({ length: 3 }, (_, n) =>
      sentence(n, `第${n}句话，很长很长的故事。`.repeat(8)),
    );
    const plan = planFinalSegments(han, { ...OPTIONS, lang: 'zh' }, true);
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

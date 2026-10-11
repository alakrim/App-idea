import { buildChapterText, countCodePoints } from './build';

const SAMPLE = [
  'Chapter 3',
  '',
  'The rain had not stopped since Tuesday. Mr. Hollis stood at the window of the old post office.',
  '',
  '"You should go home," said Mrs. Hollis. "It is nearly nine o\'clock."',
  '',
  'Yes.',
].join('\n');

describe('buildChapterText', () => {
  it('returns empty collections for empty input', () => {
    expect(buildChapterText('')).toEqual({ paragraphs: [], sentences: [] });
  });

  it('assigns stable 0-based sentence indices across the chapter', () => {
    const { sentences } = buildChapterText(SAMPLE, 'en', { segmenter: null });
    expect(sentences.map((sentence) => sentence.idx)).toEqual(sentences.map((_, i) => i));
  });

  it('gives every paragraph a contiguous, exclusive sentence range covering all sentences', () => {
    const { paragraphs, sentences } = buildChapterText(SAMPLE, 'en', { segmenter: null });
    let cursor = 0;
    for (const paragraph of paragraphs) {
      expect(paragraph.sentenceStart).toBe(cursor);
      expect(paragraph.sentenceEnd).toBeGreaterThan(paragraph.sentenceStart);
      cursor = paragraph.sentenceEnd;
    }
    expect(cursor).toBe(sentences.length);
  });

  it('points each sentence at its paragraph and inherits the paragraph kind', () => {
    const { paragraphs, sentences } = buildChapterText(SAMPLE, 'en', { segmenter: null });
    for (const paragraph of paragraphs) {
      for (let i = paragraph.sentenceStart; i < paragraph.sentenceEnd; i += 1) {
        expect(sentences[i]?.paragraphIdx).toBe(paragraph.idx);
        expect(sentences[i]?.kind).toBe(paragraph.kind);
      }
    }
  });

  it('keeps the heading as its own paragraph with one sentence', () => {
    const { paragraphs } = buildChapterText(SAMPLE, 'en', { segmenter: null });
    expect(paragraphs[0]).toMatchObject({ kind: 'heading', text: 'Chapter 3' });
    expect(paragraphs[0]?.sentenceEnd).toBe(1);
  });

  it('counts sentence characters in code points, so an emoji counts as one', () => {
    const { sentences } = buildChapterText('Hi 🎧 there, friend.', 'en', { segmenter: null });
    expect(sentences[0]?.charCount).toBe(countCodePoints('Hi 🎧 there, friend.'));
    expect(countCodePoints('🎧🎧')).toBe(2);
    expect(countCodePoints('🎧🎧')).not.toBe('🎧🎧'.length);
  });

  it('gives sentences text that concatenates back to the paragraph, modulo whitespace', () => {
    const { paragraphs, sentences } = buildChapterText(SAMPLE, 'en', { segmenter: null });
    for (const paragraph of paragraphs) {
      const joined = sentences
        .slice(paragraph.sentenceStart, paragraph.sentenceEnd)
        .map((sentence) => sentence.text)
        .join('');
      expect(joined.replace(/\s/gu, '')).toBe(paragraph.text.replace(/\s/gu, ''));
    }
  });

  it('builds CJK chapters with one paragraph per line and rule-based sentences', () => {
    const { paragraphs, sentences } = buildChapterText(
      '第一話　雨の日\n\n「もう帰ろう。」\n「まだだ。」彼女は首を振った。',
      'ja',
    );
    expect(paragraphs.map((paragraph) => paragraph.kind)).toEqual(['heading', 'dialogue', 'dialogue']);
    expect(sentences.map((sentence) => sentence.text)).toEqual([
      '第一話 雨の日',
      '「もう帰ろう。」',
      '「まだだ。」',
      '彼女は首を振った。',
    ]);
  });
});

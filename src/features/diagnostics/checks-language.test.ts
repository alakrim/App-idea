import { checkLegacyDecoders, checkRegexFeatures, checkSentenceSegmentation, globalLanguageEnv } from './checks-language';

/** A stand-in segmenter that splits on full stops, enough to exercise the check's counting. */
class DotSegmenter {
  segment(text: string): { segment: string }[] {
    return text.split(/(?<=[。.])/u).map((segment) => ({ segment }));
  }
}

class RealDecoder {
  constructor(private readonly label: string) {}
  decode(bytes: Uint8Array): string {
    if (this.label !== 'gbk' && this.label !== 'big5' && this.label !== 'shift_jis' && this.label !== 'euc-kr') {
      throw new RangeError(`Unsupported encoding: ${this.label}`);
    }
    // Only the four samples the probe sends are needed, so decode them by their first byte.
    const table: Record<number, string> = { 0xd6: '中文', 0xa4: '中文', 0x93: '日本', 0xc7: '한국' };
    return table[bytes[0] ?? -1] ?? '';
  }
}

describe('sentence segmentation probe', () => {
  it('passes when every sample splits into the expected sentence count', () => {
    const outcome = checkSentenceSegmentation({ Segmenter: DotSegmenter as never });
    expect(outcome.status).toBe('pass');
    expect(outcome.values).toMatchObject({ available: true, sentenceCounts: { en: 2, zh: 2, ja: 2 } });
  });

  it('fails with a clear message when Intl.Segmenter is missing', () => {
    const outcome = checkSentenceSegmentation({});
    expect(outcome).toMatchObject({ status: 'fail', message: 'Intl.Segmenter is not available.' });
  });
});

describe('legacy decoder probe', () => {
  it('passes when all four encodings decode their known samples', () => {
    const outcome = checkLegacyDecoders({ TextDecoder: RealDecoder as never });
    expect(outcome.status).toBe('pass');
    expect(outcome.values).toMatchObject({
      decoders: { gbk: 'pass', big5: 'pass', shift_jis: 'pass', 'euc-kr': 'pass' },
    });
  });

  it('fails only the encodings that do not decode, and names them', () => {
    const outcome = checkLegacyDecoders({ TextDecoder: RealDecoder as never });
    const hermesLike = class {
      constructor(label: string) {
        if (label === 'big5') throw new RangeError('Unsupported encoding: big5');
        return new RealDecoder(label) as never;
      }
    };
    const partial = checkLegacyDecoders({ TextDecoder: hermesLike as never });

    expect(outcome.status).toBe('pass');
    expect(partial.status).toBe('fail');
    expect(partial.message).toBe('Not decoded: big5.');
    expect(partial.values).toMatchObject({ decoders: { gbk: 'pass', big5: 'Unsupported encoding: big5' } });
  });

  it('fails when TextDecoder is missing', () => {
    expect(checkLegacyDecoders({}).status).toBe('fail');
  });
});

describe('regex probe', () => {
  it('passes on an engine with lookbehind and Unicode letters', () => {
    expect(checkRegexFeatures()).toMatchObject({
      status: 'pass',
      values: { lookbehind: true, unicodeLetters: true },
    });
  });
});

describe('globalLanguageEnv', () => {
  it('reads the TextDecoder global, which every JavaScript engine the app runs on has', () => {
    expect(globalLanguageEnv().TextDecoder).toBe((globalThis as { TextDecoder?: unknown }).TextDecoder);
  });
});

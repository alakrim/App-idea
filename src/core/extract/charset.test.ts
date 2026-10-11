import { decode, detectCharset, normalizeCharsetLabel } from './charset';
import { ExtractError } from './errors';

const encode = (text: string): Uint8Array => new TextEncoder().encode(text);

describe('detectCharset', () => {
  it('prefers a UTF-8 BOM over a conflicting header', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...encode('<p>hi</p>')]);
    expect(detectCharset(bytes, 'text/html; charset=gbk')).toBe('utf-8');
  });

  it('detects UTF-16 byte order marks', () => {
    expect(detectCharset(new Uint8Array([0xff, 0xfe, 0x3c, 0x00]))).toBe('utf-16le');
    expect(detectCharset(new Uint8Array([0xfe, 0xff, 0x00, 0x3c]))).toBe('utf-16be');
  });

  it('reads the charset parameter of the Content-Type header, quoted or not, in any case', () => {
    const bytes = encode('<p>x</p>');
    expect(detectCharset(bytes, 'text/html; charset=Shift_JIS')).toBe('shift_jis');
    expect(detectCharset(bytes, 'text/html; Charset="GBK"')).toBe('gbk');
  });

  it('lets the header win over a conflicting meta tag', () => {
    const bytes = encode('<meta charset="gbk"><p>x</p>');
    expect(detectCharset(bytes, 'text/html; charset=utf-8')).toBe('utf-8');
  });

  it('reads <meta charset> from the first 4 KB', () => {
    const bytes = encode('<!doctype html><html><head><meta charset="GBK"></head></html>');
    expect(detectCharset(bytes)).toBe('gbk');
  });

  it('reads an http-equiv Content-Type meta tag', () => {
    const bytes = encode(
      '<html><head><meta http-equiv="Content-Type" content="text/html; charset=Big5"></head></html>',
    );
    expect(detectCharset(bytes)).toBe('big5');
  });

  it('ignores a meta tag that appears after the 4 KB scan window', () => {
    const padding = 'a'.repeat(4096);
    const bytes = encode(`${padding}<meta charset="gbk">文字`);
    expect(detectCharset(bytes)).toBe('utf-8');
  });

  it('falls back to UTF-8 when valid multi-byte UTF-8 has no label', () => {
    expect(detectCharset(encode('日本語のテキスト 🙂'))).toBe('utf-8');
  });

  it('falls back to windows-1252 when unlabelled bytes are not valid UTF-8', () => {
    expect(detectCharset(new Uint8Array([0x63, 0x61, 0x66, 0xe9]))).toBe('windows-1252');
  });
});

describe('normalizeCharsetLabel', () => {
  it('trims, unquotes and lowercases a label', () => {
    expect(normalizeCharsetLabel('  "UTF-8" ')).toBe('utf-8');
  });
});

describe('decode', () => {
  it('round-trips UTF-8 Chinese, Japanese and Korean text', () => {
    const text = '中文 日本語 한국어';
    expect(decode(encode(text), 'utf-8')).toBe(text);
  });

  it('decodes GBK bytes through TextDecoder', () => {
    // 中 is GBK D6 D0 and 文 is GBK CE C4.
    expect(decode(new Uint8Array([0xd6, 0xd0, 0xce, 0xc4]), 'gbk')).toBe('中文');
  });

  it('decodes Shift_JIS bytes through TextDecoder', () => {
    // 日 is Shift_JIS 93 FA and 本 is Shift_JIS 96 7B.
    expect(decode(new Uint8Array([0x93, 0xfa, 0x96, 0x7b]), 'shift_jis')).toBe('日本');
  });

  it('uses the injected fallback when TextDecoder does not know the label', () => {
    const fallback = jest.fn((bytes: Uint8Array) => `len:${bytes.length}`);
    const decoders = new Map([['x-test-codec', fallback]]);
    expect(decode(new Uint8Array([1, 2, 3]), 'x-test-codec', decoders)).toBe('len:3');
    expect(fallback).toHaveBeenCalledTimes(1);
  });

  it('throws UNSUPPORTED_ENCODING when no decoder exists for the label', () => {
    let caught: unknown;
    try {
      decode(new Uint8Array([1]), 'x-no-such-codec');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ExtractError);
    expect((caught as ExtractError).code).toBe('UNSUPPORTED_ENCODING');
  });

  it('uses the built-in UTF-8 decoder when TextDecoder is unavailable', () => {
    const original = globalThis.TextDecoder;
    // The built-in decoder is the only one that can run without TextDecoder.
    Object.defineProperty(globalThis, 'TextDecoder', { value: undefined, configurable: true });
    try {
      expect(decode(encode('日本'), 'utf-8')).toBe('日本');
      expect(decode(new Uint8Array([0x61, 0xff, 0x62]), 'utf-8')).toBe('a�b');
      expect(decode(new Uint8Array([0xf0, 0x9f, 0x99, 0x82]), 'utf-8')).toBe('🙂');
    } finally {
      Object.defineProperty(globalThis, 'TextDecoder', { value: original, configurable: true });
    }
  });

  it('throws UNSUPPORTED_ENCODING for a legacy label when TextDecoder is unavailable', () => {
    const original = globalThis.TextDecoder;
    Object.defineProperty(globalThis, 'TextDecoder', { value: undefined, configurable: true });
    try {
      expect(() => decode(new Uint8Array([0xd6, 0xd0]), 'gbk')).toThrow(ExtractError);
    } finally {
      Object.defineProperty(globalThis, 'TextDecoder', { value: original, configurable: true });
    }
  });
});

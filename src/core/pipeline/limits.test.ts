import { FETCH_LIMITS, PAGE_MAX_BYTES, PDF_MAX_BYTES, pdfTooLargeMessage, utf8ByteLength } from './limits';

describe('size limits', () => {
  it('caps PDFs at 25 MB and pages at 5 MB', () => {
    expect(PDF_MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(FETCH_LIMITS.maxBytes).toBe(PAGE_MAX_BYTES);
    expect(PAGE_MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  it('tells the listener the size of the file and the limit', () => {
    expect(pdfTooLargeMessage(38 * 1024 * 1024)).toBe(
      'This PDF is 38 MB. Lectio can read PDFs up to 25 MB.',
    );
  });

  it('rounds the reported size up, so a file just over the limit is never shown as allowed', () => {
    expect(pdfTooLargeMessage(25 * 1024 * 1024 + 1)).toBe(
      'This PDF is 26 MB. Lectio can read PDFs up to 25 MB.',
    );
  });
});

describe('utf8ByteLength', () => {
  it.each([
    ['', 0],
    ['abc', 3],
    ['é', 2],
    ['日本', 6],
    ['😀', 4],
    ['a😀b', 6],
    ['\ud800', 3],
    ['\udc00x', 4],
  ])('counts %j as %i bytes', (text, expected) => {
    expect(utf8ByteLength(text)).toBe(expected);
  });

  it('matches the encoder on mixed text', () => {
    const text = 'Lorem ipsum — 東京 😀 café\n'.repeat(50);
    expect(utf8ByteLength(text)).toBe(new TextEncoder().encode(text).byteLength);
  });
});

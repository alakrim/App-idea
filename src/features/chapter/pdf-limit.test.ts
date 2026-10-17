import { PDF_MAX_BYTES, pdfSizeProblem } from './pdf-limit';

const MB = 1024 * 1024;

describe('pdfSizeProblem (QA-F F-10)', () => {
  it('allows a PDF at exactly the limit', () => {
    expect(pdfSizeProblem(PDF_MAX_BYTES)).toBeNull();
  });

  it('allows a PDF whose size the picker did not report', () => {
    expect(pdfSizeProblem(undefined)).toBeNull();
  });

  it('refuses a PDF one byte over the limit, and says what the limit is', () => {
    expect(pdfSizeProblem(PDF_MAX_BYTES + 1)).toBe(
      'This PDF is 25 MB. Lectio can read PDFs up to 25 MB.',
    );
  });

  it('names the size of a large PDF in whole megabytes', () => {
    expect(pdfSizeProblem(38 * MB)).toBe('This PDF is 38 MB. Lectio can read PDFs up to 25 MB.');
  });

  it('names a size near the limit to one decimal place', () => {
    expect(pdfSizeProblem(Math.round(25.2 * MB))).toBe(
      'This PDF is 25.2 MB. Lectio can read PDFs up to 25 MB.',
    );
  });
});

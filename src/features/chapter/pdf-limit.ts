/**
 * The largest PDF Lectio reads. A larger file is refused when it is picked, before it is read into
 * memory as base64 and sent in one request (QA-F F-10).
 */
export const PDF_MAX_BYTES = 25 * 1024 * 1024;

const MEGABYTE = 1024 * 1024;

/**
 * The message for a PDF over the limit, or null when it may be read. An unknown size is allowed,
 * because the picker does not always report one.
 */
export function pdfSizeProblem(bytes: number | undefined): string | null {
  if (bytes === undefined || bytes <= PDF_MAX_BYTES) return null;
  const megabytes = Number((bytes / MEGABYTE).toFixed(1));
  return `This PDF is ${megabytes} MB. Lectio can read PDFs up to 25 MB.`;
}

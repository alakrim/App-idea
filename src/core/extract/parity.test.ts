import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';

import { PARITY_CASES } from './__fixtures__/parity-cases';
import { decode, detectCharset } from './charset';
import { extractArticle, extractFromHtml } from './pipeline';

import type { ExtractResult } from './types';

/**
 * Parity with the pipeline before F4 (one parse per extractor, Defuddle's Node build). Every fixture
 * is extracted through both entry points and compared with the golden file, which was generated from
 * the pre-F4 code. A digest of the whole result is the proof: any change to a block, a score, a
 * signal or the candidate order changes it. Regenerate the golden only for an intended behaviour change.
 */

const FIXTURES = join(__dirname, '__fixtures__');

interface Digest {
  sha256: string;
  decision: string;
  bestExtractor: string | null;
  score: number;
  blocks: number;
  textChars: number;
  alternatives: string[];
  warnings: string[];
}

function digest(result: ExtractResult): Digest {
  return {
    sha256: createHash('sha256').update(JSON.stringify(result)).digest('hex'),
    decision: result.decision,
    bestExtractor: result.best?.extractor ?? null,
    score: result.score,
    blocks: result.best?.blocks.length ?? 0,
    textChars: result.best?.text.length ?? 0,
    alternatives: result.alternatives.map((candidate) => candidate.extractor),
    warnings: result.warnings,
  };
}

const golden = JSON.parse(readFileSync(join(FIXTURES, 'parity.golden.json'), 'utf8')) as Record<
  string,
  Digest
>;

describe('extraction parity with the pre-F4 pipeline', () => {
  it('has a golden entry for every fixture on both entry points', () => {
    const expected = PARITY_CASES.flatMap((c) => [`${c.file}#article`, `${c.file}#html`]);
    expect(Object.keys(golden).sort()).toEqual([...expected].sort());
  });

  it.each(PARITY_CASES)('extracts $file from its bytes exactly as before', async (c) => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, c.file)));
    const result = await extractArticle({ bytes, contentType: c.contentType, url: c.url });
    expect(digest(result)).toEqual(golden[`${c.file}#article`]);
  });

  it.each(PARITY_CASES)('extracts $file from decoded HTML exactly as before', async (c) => {
    const bytes = new Uint8Array(readFileSync(join(FIXTURES, c.file)));
    const charset = detectCharset(bytes, c.contentType);
    const result = await extractFromHtml(decode(bytes, charset), c.url, { charset });
    expect(digest(result)).toEqual(golden[`${c.file}#html`]);
  });
});

import { z } from 'zod';

import { parseTranslateReply, translateResponseSchema } from './schemas';
import { strictViolations } from '../__fixtures__/strict-json-schema';

describe('parseTranslateReply', () => {
  it('accepts a well-formed reply', () => {
    const reply = parseTranslateReply(
      '{"items":[{"idx":0,"text":"Hello."},{"idx":1,"text":"Bye."}]}',
    );
    expect(reply).toEqual({
      ok: true,
      items: [
        { idx: 0, text: 'Hello.' },
        { idx: 1, text: 'Bye.' },
      ],
    });
  });

  it('accepts an empty items list (the caller decides what is missing)', () => {
    expect(parseTranslateReply('{"items":[]}')).toEqual({ ok: true, items: [] });
  });

  it('accepts a reply wrapped in a json code fence', () => {
    const reply = parseTranslateReply('```json\n{"items":[{"idx":2,"text":"Ok"}]}\n```');
    expect(reply).toEqual({ ok: true, items: [{ idx: 2, text: 'Ok' }] });
  });

  it('rejects text that is not JSON, without echoing it', () => {
    const reply = parseTranslateReply('Sure! Here is the translation: Hello.');
    expect(reply).toEqual({ ok: false, reason: 'reply is not valid JSON' });
  });

  it('rejects a missing items key and names the path', () => {
    const reply = parseTranslateReply('{"translations":[]}');
    expect(reply.ok).toBe(false);
    if (!reply.ok) expect(reply.reason).toMatch(/^items:/u);
  });

  it('rejects an idx that is not an integer', () => {
    const reply = parseTranslateReply('{"items":[{"idx":1.5,"text":"x"}]}');
    expect(reply.ok).toBe(false);
    if (!reply.ok) expect(reply.reason).toMatch(/^items\.0\.idx:/u);
  });

  it('rejects a numeric string idx and a null text', () => {
    expect(parseTranslateReply('{"items":[{"idx":"3","text":"x"}]}').ok).toBe(false);
    expect(parseTranslateReply('{"items":[{"idx":3,"text":null}]}').ok).toBe(false);
  });

  it('ignores extra keys on an item, since zod strips them', () => {
    const reply = parseTranslateReply('{"items":[{"idx":0,"text":"A","note":"x"}]}');
    expect(reply).toEqual({ ok: true, items: [{ idx: 0, text: 'A' }] });
  });
});

describe('translateResponseSchema', () => {
  it('is strict json_schema compatible: every key required, no extra keys at any depth', () => {
    const json = z.toJSONSchema(translateResponseSchema, { io: 'output', reused: 'inline' });
    expect(strictViolations(json)).toEqual([]);
  });
});

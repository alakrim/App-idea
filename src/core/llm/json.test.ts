import { parseJsonReply, stripCodeFence } from './json';

describe('stripCodeFence', () => {
  it('removes a fence that wraps the whole reply, with or without a json tag', () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripCodeFence('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('returns other text trimmed and leaves a fence in the middle alone', () => {
    expect(stripCodeFence('  {"a":1}  ')).toBe('{"a":1}');
    expect(stripCodeFence('Here: ```json {} ``` done')).toBe('Here: ```json {} ``` done');
  });
});

describe('parseJsonReply', () => {
  it('parses plain and fenced JSON', () => {
    expect(parseJsonReply('{"items":[]}')).toEqual({ ok: true, value: { items: [] } });
    expect(parseJsonReply('```json\n{"keep":[0,2]}\n```')).toEqual({
      ok: true,
      value: { keep: [0, 2] },
    });
  });

  it('reports invalid JSON without throwing and without echoing the reply', () => {
    expect(parseJsonReply('not json')).toEqual({ ok: false });
  });
});

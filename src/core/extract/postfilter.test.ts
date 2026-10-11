import { postfilter } from './postfilter';
import type { Block } from './types';

const p = (text: string): Block => ({ tag: 'p', text });
const h = (text: string): Block => ({ tag: 'h', text });

describe('postfilter', () => {
  it('removes a body line that repeats the page title, ignoring case and a site suffix', () => {
    const { blocks, removed } = postfilter(
      [h('Storm hits coast'), p('The storm arrived before dawn and the coast was flooded.')],
      { title: 'Storm hits coast | Example News' },
    );
    expect(blocks.map((block) => block.text)).toEqual([
      'The storm arrived before dawn and the coast was flooded.',
    ]);
    expect(removed).toEqual([{ index: 0, text: 'Storm hits coast', reason: 'duplicate_title' }]);
  });

  it('keeps a line that only shares a prefix with the title', () => {
    const { blocks } = postfilter([p('Chapter 1')], { title: 'Chapter 12' });
    expect(blocks).toEqual([p('Chapter 1')]);
  });

  it('removes a byline that matches the extracted byline exactly, ignoring case', () => {
    const { removed } = postfilter([p('jane ROE'), p('Narrative sentence goes here.')], {
      byline: 'Jane Roe',
    });
    expect(removed).toEqual([{ index: 0, text: 'jane ROE', reason: 'byline' }]);
  });

  it('removes lexicon matches with the rule id as the reason', () => {
    const { blocks, removed } = postfilter([
      p('Share this on Facebook'),
      p('Related articles'),
      p('Leave a reply'),
      p('We use cookies to improve your experience.'),
      p('下一章'),
      p('Support me on Patreon!'),
      p('19 hours ago'),
      p('She opened the letter and read it twice.'),
    ]);
    expect(removed.map((item) => item.reason)).toEqual([
      'share_prompt',
      'related_links',
      'comments_prompt',
      'cookie_notice',
      'nav_next_prev_zh',
      'donation_note',
      'timestamp_relative',
    ]);
    expect(blocks.map((block) => block.text)).toEqual([
      'She opened the letter and read it twice.',
    ]);
  });

  it('keeps a long narrative line that contains a lexicon word', () => {
    const line =
      'At the end of the next chapter in the old journal, the author admitted that the expedition had ' +
      'failed, and the crew agreed to return home before winter closed the mountain passes behind them, ' +
      'leaving the surveyed valley, the frozen lake, and the unfinished map to the next generation of explorers.';
    const { blocks } = postfilter([p(line)]);
    expect(blocks).toEqual([p(line)]);
  });

  it('removes a short, repeated line that does not end a sentence', () => {
    const { blocks, removed } = postfilter([
      p('Advertisement'),
      p('Real text one.'),
      p('Advertisement'),
      p('Real text two.'),
      p('Advertisement'),
    ]);
    expect(removed.map((item) => item.reason)).toEqual([
      'repeated_short_block',
      'repeated_short_block',
      'repeated_short_block',
    ]);
    expect(blocks.map((block) => block.text)).toEqual(['Real text one.', 'Real text two.']);
  });

  it('keeps short dialogue that repeats but ends a sentence', () => {
    const dialogue = ['"Yes."', 'Rain fell.', '"Yes."', 'A door shut.', '"Yes."'];
    const { blocks, removed } = postfilter(dialogue.map(p));
    expect(removed).toEqual([]);
    expect(blocks).toHaveLength(5);
  });

  it('does not treat two repeats as boilerplate', () => {
    const { removed } = postfilter([p('Menu'), p('Story.'), p('Menu')]);
    expect(removed).toEqual([]);
  });

  it('reports indices from the original list, not the filtered one', () => {
    const { removed } = postfilter([p('Keep me.'), p('Share this on X'), p('Keep me too.')]);
    expect(removed).toEqual([{ index: 1, text: 'Share this on X', reason: 'share_prompt' }]);
  });

  it('does nothing when there is no title, byline or boilerplate', () => {
    const input = [p('One complete sentence.'), p('Another complete sentence.')];
    expect(postfilter(input)).toEqual({ blocks: input, removed: [] });
  });
});

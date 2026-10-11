import { htmlToBlocks } from './blocks';

describe('htmlToBlocks', () => {
  it('turns paragraphs into p blocks in document order', () => {
    expect(htmlToBlocks('<p>First.</p><p>Second.</p>')).toEqual([
      { tag: 'p', text: 'First.' },
      { tag: 'p', text: 'Second.' },
    ]);
  });

  it('keeps headings, list items, blockquotes and preformatted text as their own tags', () => {
    const blocks = htmlToBlocks(
      '<h2>Part one</h2><ul><li>apples</li></ul><blockquote>Quoted line.</blockquote><pre>a\n  b</pre>',
    );
    expect(blocks).toEqual([
      { tag: 'h', text: 'Part one' },
      { tag: 'li', text: 'apples' },
      { tag: 'blockquote', text: 'Quoted line.' },
      { tag: 'pre', text: 'a\n  b' },
    ]);
  });

  it('splits CJK novel text on <br><br> into paragraphs', () => {
    const blocks = htmlToBlocks('第一段。<br><br>第二段。<br><br>第三段。');
    expect(blocks.map((block) => block.text)).toEqual(['第一段。', '第二段。', '第三段。']);
  });

  it('splits on a single <br> as well, since each line is a paragraph in novels', () => {
    const blocks = htmlToBlocks('一行目。<br>二行目。');
    expect(blocks.map((block) => block.text)).toEqual(['一行目。', '二行目。']);
  });

  it('keeps inline phrasing inside one block', () => {
    expect(htmlToBlocks('<p>Hello <strong>big</strong> <a href="/x">world</a></p>')).toEqual([
      { tag: 'p', text: 'Hello big world' },
    ]);
  });

  it('collapses whitespace, including non-breaking and ideographic spaces', () => {
    expect(htmlToBlocks('<p>  a \n  b&nbsp;c　d  </p>')).toEqual([
      { tag: 'p', text: 'a b c d' },
    ]);
  });

  it('drops script, style and noscript content', () => {
    const blocks = htmlToBlocks(
      '<p>Kept.</p><script>var x = 1;</script><style>p{}</style><noscript>Enable JS</noscript>',
    );
    expect(blocks).toEqual([{ tag: 'p', text: 'Kept.' }]);
  });

  it('gives a paragraph inside a list item or blockquote the outer tag', () => {
    expect(htmlToBlocks('<li><p>nested</p></li>')).toEqual([{ tag: 'li', text: 'nested' }]);
    expect(htmlToBlocks('<blockquote><p>quoted</p></blockquote>')).toEqual([
      { tag: 'blockquote', text: 'quoted' },
    ]);
  });

  it('turns loose text in divs into separate paragraphs', () => {
    expect(htmlToBlocks('<div>Alpha.</div><div>Beta.</div>')).toEqual([
      { tag: 'p', text: 'Alpha.' },
      { tag: 'p', text: 'Beta.' },
    ]);
  });

  it('separates table cells', () => {
    expect(htmlToBlocks('<table><tr><td>A</td><td>B</td></tr></table>')).toEqual([
      { tag: 'p', text: 'A' },
      { tag: 'p', text: 'B' },
    ]);
  });

  it('turns a <br> inside <pre> into a newline instead of a split', () => {
    expect(htmlToBlocks('<pre>one<br>two</pre>')).toEqual([{ tag: 'pre', text: 'one\ntwo' }]);
  });

  it('returns no blocks for empty or whitespace-only content', () => {
    expect(htmlToBlocks('')).toEqual([]);
    expect(htmlToBlocks('<p> </p><div><br></div>')).toEqual([]);
  });
});

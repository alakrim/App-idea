import { stripPdfFurniture } from './pdf-text';

const page = (number: number, body: string[]): string =>
  [`Harbour Notes ${2020 + number}`, ...body, `- ${number} -`].join('\n');

describe('stripPdfFurniture', () => {
  it('removes a running header that changes its digits, and page numbers, on every page', () => {
    const pages = [
      page(1, ['The first paragraph.', 'More of it.']),
      page(2, ['The second paragraph.']),
      page(3, ['The third paragraph.']),
      page(4, ['The fourth paragraph.']),
    ];
    const text = stripPdfFurniture(pages);
    expect(text).not.toContain('Harbour Notes');
    expect(text).not.toMatch(/^- \d+ -$/mu);
    expect(text).toContain('The first paragraph.\nMore of it.');
    expect(text).toContain('The fourth paragraph.');
  });

  it('keeps every line of a short document, where repeats are not evidence of furniture', () => {
    const text = stripPdfFurniture([page(1, ['Only text.']), page(2, ['Other text.'])]);
    expect(text).toContain('Harbour Notes 2021');
    expect(text).toContain('Only text.');
  });

  it('keeps a line that repeats on only a few pages, and short lines such as dialogue', () => {
    const pages = [
      page(1, ['Yes.', 'The sea was grey.']),
      page(2, ['Yes.', 'The rain fell.']),
      page(3, ['Yes.', 'The wind rose.']),
      page(4, ['No.', 'The night came.']),
    ];
    const text = stripPdfFurniture(pages);
    expect(text).toContain('Yes.');
    expect(text).toContain('The sea was grey.');
  });

  it('keeps a year that stands alone as a title, since page numbers have at most three digits', () => {
    const text = stripPdfFurniture([page(1, ['1984']), page(2, ['Body.']), page(3, ['Body two.'])]);
    expect(text).toContain('1984');
  });

  it('joins pages with a blank line and drops empty pages', () => {
    expect(stripPdfFurniture(['First page.', '', 'Third page.'])).toBe(
      'First page.\n\nThird page.',
    );
  });
});

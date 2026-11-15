import { describe, expect, it } from 'vitest';
import { selectionQuote } from '../../shared/capture';

describe('selection quoting', () => {
  it('formatsSelectionAsBlockquoteWithEveryLineQuoted', () => {
    expect(selectionQuote('  First line\r\nsecond  \n\nthird')).toBe('> First line\n> second\n>\n> third');
  });

  it('capsTheTextAtTheRequestedLength', () => {
    expect(selectionQuote('abcdef', 4)).toBe('> abcd');
    expect(selectionQuote('   ')).toBe('');
  });
});

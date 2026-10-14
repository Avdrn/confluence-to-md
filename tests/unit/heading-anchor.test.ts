import { describe, expect, it } from 'vitest';
import { obsidianHeadingAnchor } from '../../src/convert/heading-anchor';

describe('obsidianHeadingAnchor', (): void => {
  it('keeps the heading text, strips formatting and link-breaking characters', (): void => {
    expect(obsidianHeadingAnchor('**Bold** and `code` [link](x) #tag |pipe ^caret [x]')).toBe('Bold and code link tag pipe caret x');
  });

  it('keeps case and collapses whitespace', (): void => {
    expect(obsidianHeadingAnchor('  Document   History ')).toBe('Document History');
  });
});

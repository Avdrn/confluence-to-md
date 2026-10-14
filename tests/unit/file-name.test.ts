import { describe, expect, it } from 'vitest';
import { sanitizeFileName, shortenName } from '../../src/sync/placement/file-name';

describe('sanitizeFileName', (): void => {
  it('strips the characters the file system and Obsidian links refuse', (): void => {
    expect(sanitizeFileName('POL-01: Info/Sec <Policy>? [v2] #1 ^ a|b "q" *', 'x')).toBe('POL-01 InfoSec Policy v2 1 ab q');
  });

  it('collapses whitespace and drops leading and trailing dots and spaces', (): void => {
    expect(sanitizeFileName('  Hello   world... ', 'x')).toBe('Hello world');
    expect(sanitizeFileName('.hidden', 'x')).toBe('hidden');
  });

  it('removes control characters', (): void => {
    expect(sanitizeFileName(`a${String.fromCharCode(1)}b${String.fromCharCode(0x7f)}c`, 'x')).toBe('abc');
  });

  it('suffixes names Windows reserves', (): void => {
    expect(sanitizeFileName('CON', 'x')).toBe('CON_');
    expect(sanitizeFileName('com1', 'x')).toBe('com1_');
  });

  it('falls back when nothing printable is left', (): void => {
    expect(sanitizeFileName('???', 'Page 1')).toBe('Page 1');
    expect(sanitizeFileName('', 'Page 1')).toBe('Page 1');
  });

  it('caps the length at a word boundary', (): void => {
    const long: string = 'word '.repeat(40).trim();
    const name: string = sanitizeFileName(long, 'x');
    expect(name.length).toBeLessThanOrEqual(100);
    expect(name.endsWith(' ')).toBe(false);
    expect(name.endsWith('word')).toBe(true);
  });
});

describe('shortenName', (): void => {
  it('cuts back to the last space when that keeps most of the allowance', (): void => {
    expect(shortenName('abcdef ghijkl', 8)).toBe('abcdef');
  });

  it('cuts hard when the first word is too long', (): void => {
    expect(shortenName('abcdefghijkl', 8)).toBe('abcdefgh');
  });

  it('never splits a surrogate pair', (): void => {
    const emoji: string = String.fromCodePoint(0x1f600);
    expect(shortenName(`abc${emoji}def`, 4)).toBe('abc');
  });

  it('leaves short names alone', (): void => {
    expect(shortenName('short', 10)).toBe('short');
  });
});

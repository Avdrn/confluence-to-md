import { describe, expect, it } from 'vitest';
import { SiblingNames } from '../../src/sync/placement/sibling-names';

describe('SiblingNames', (): void => {
  it('numbers duplicates in claim order', (): void => {
    const names: SiblingNames = new SiblingNames();
    expect(names.claim('A')).toBe('A');
    expect(names.claim('A')).toBe('A (2)');
    expect(names.claim('A')).toBe('A (3)');
  });

  it('compares case-insensitively', (): void => {
    const names: SiblingNames = new SiblingNames();
    names.claim('Policies');
    expect(names.claim('policies')).toBe('policies (2)');
  });

  it('never hands out a reserved name', (): void => {
    const names: SiblingNames = new SiblingNames(['iso']);
    expect(names.claim('ISO')).toBe('ISO (2)');
  });

  it('keeps the extension at the end', (): void => {
    const names: SiblingNames = new SiblingNames();
    expect(names.claim('diagram', '.png')).toBe('diagram.png');
    expect(names.claim('diagram', '.png')).toBe('diagram (2).png');
    expect(names.claim('diagram', '.svg')).toBe('diagram.svg');
  });
});

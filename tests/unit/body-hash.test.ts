import { describe, expect, it } from 'vitest';
import { hashBody } from '../../src/sync/plan/body-hash';

describe('hashBody', (): void => {
  it('is deterministic and 16 hex characters long', (): void => {
    expect(hashBody('hello')).toBe(hashBody('hello'));
    expect(hashBody('hello')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('ignores surrounding whitespace', (): void => {
    expect(hashBody('\n\nhello \n')).toBe(hashBody('hello'));
  });

  it('changes when one character changes', (): void => {
    expect(hashBody('hello')).not.toBe(hashBody('hellp'));
  });
});

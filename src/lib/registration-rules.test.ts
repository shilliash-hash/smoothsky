import { describe, expect, it } from 'vitest';
import { registrationRule } from './registration-rules';

describe('registration fallback', () => {
  it('uses VP- and exactly three uppercase letters for an unknown country', () => {
    expect(registrationRule([], 'XX')).toMatchObject({ prefix: 'VP-', suffix_pattern: '[A-Z]{3}', suffix_length: 3, alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' });
  });
  it('preserves an existing Canadian rule', () => {
    const rule = { country: 'CA', prefix: 'C-F', suffix_pattern: '[A-Z]{3}', suffix_length: 3, alphabet: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' };
    expect(registrationRule([rule], 'CA')).toBe(rule);
  });
});
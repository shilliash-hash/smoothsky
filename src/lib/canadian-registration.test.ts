import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
describe('Canadian registration repair', () => {
  const sql = readFileSync('docs/canadian-registration-repair.sql', 'utf8');
  it('covers ISO Canada imports', () => expect(sql).toContain("('CA', 'C-F', '[A-Z]{3}', 3"));
  it('covers full-country-name imports', () => expect(sql).toContain("('Canada', 'C-F', '[A-Z]{3}', 3"));
  it('preserves existing registration rules', () => expect(sql).toContain('ON CONFLICT (country) DO NOTHING'));
});
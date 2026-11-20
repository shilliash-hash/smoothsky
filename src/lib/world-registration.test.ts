import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('drizzle/migrations/0033_worldwide_registration_fallback.sql', 'utf8');
const rules = [...sql.matchAll(/\('([^']+)','([^']+)',(\d+)\)/g)].map(([,country,prefix,length]) => ({ country, prefix, length: Number(length) }));

describe('world registration defaults', () => {
  it.each([
    ['US','N-',4], ['BR','PR-',3], ['AU','VH-',3], ['MX','XA-',3],
    ['AR','LV-',3], ['CL','CC-',3], ['CO','HK-',3], ['JP','JA-',4],
    ['CN','B-',4], ['IN','VT-',3], ['ZA','ZS-',3], ['NZ','ZK-',3],
    ['AE','A6-',3], ['SA','HZ-',3], ['KR','HL-',4], ['TR','TC-',3],
    ['ID','PK-',3], ['TH','HS-',3],
  ])('%s receives its requested game-format prefix', (country, prefix, length) => {
    expect(rules.find(rule => rule.country === country)).toEqual({ country, prefix, length });
  });
  it('assigns each explicit country only once', () => {
    expect(new Set(rules.map(rule => rule.country)).size).toBe(rules.length);
  });
});
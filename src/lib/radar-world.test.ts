// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
const fake = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: fake }));
import { radarWorldQuery, radarTierQuery, radarContextQuery, radarPortCodes } from './radar-world';

beforeEach(() => vi.resetAllMocks());
describe('bounded world radar reads', () => {
  it('queries only 500 airports ordered by size for the selected tiers', async () => {
    const chain = { select: vi.fn(), in: vi.fn(), order: vi.fn(), limit: vi.fn().mockResolvedValue({ data: [], error: null }) };
    chain.select.mockReturnValue(chain); chain.in.mockReturnValue(chain); chain.order.mockReturnValue(chain);
    fake.from.mockReturnValue(chain);
    const query = radarTierQuery([1, 2, 3]);
    await query.queryFn?.({} as never);
    expect(chain.in).toHaveBeenCalledWith('size', [1, 2, 3]);
    expect(chain.order).toHaveBeenCalledWith('size', { ascending: false });
    expect(chain.limit).toHaveBeenCalledWith(500);
    expect(query.staleTime).toBe(60_000);
  });
  it('retains all priority ports in addition to the 500 tier ports', () => {
    const tier = Array.from({ length: 500 }, (_, i) => `T${i}`);
    expect(radarPortCodes(tier, ['FBO', 'WORLD', 'LIVE', 'T0'])).toHaveLength(503);
    expect(radarPortCodes(tier, ['FBO', 'WORLD', 'LIVE'])).toEqual(expect.arrayContaining(['FBO', 'WORLD', 'LIVE']));
  });
  it('paginates world activity beyond the API row limit without dropping ports', async () => {
    const range = vi.fn().mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => ({ icao: `W${i}` })), error: null })
      .mockResolvedValueOnce({ data: [{ icao: 'LAST' }], error: null });
    fake.rpc.mockReturnValue({ order: () => ({ range }) });
    const rows = await radarWorldQuery.queryFn?.({} as never);
    expect(rows).toHaveLength(1001);
    expect(range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(rows?.at(-1)).toEqual({ icao: 'LAST' });
  });
  it('loads pools and metrics only for visible codes in batches of at most 200', async () => {
    const scopes: string[][] = [];
    fake.from.mockReturnValue({ select: () => ({ in: (_field: string, codes: string[]) => { scopes.push(codes); return Promise.resolve({ data: [], error: null }); } }) });
    fake.rpc.mockResolvedValue({ data: [], error: null });
    const codes = Array.from({ length: 503 }, (_, i) => `P${i}`);
    await radarContextQuery(codes).queryFn?.({} as never);
    expect(scopes.map(s => s.length)).toEqual([200, 200, 200, 200, 103, 103]);
    expect(fake.rpc.mock.calls.map(call => call[1]?.p_icaos.length)).toEqual([200, 200, 103]);
    expect(scopes.flat().every(code => codes.includes(code))).toBe(true);
  });
});
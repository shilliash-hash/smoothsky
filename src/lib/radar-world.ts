import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

export const RADAR_TIER_LIMIT = 500;
export const RADAR_CONTEXT_BATCH = 200;
export type WorldActivity = Database['public']['Functions']['get_radar_world_activity']['Returns'][number];

export const radarWorldQuery = queryOptions({
  queryKey: ['radar-world-activity'],
  queryFn: async () => {
    const rows: WorldActivity[] = [];
    for (let offset = 0; ; offset += 1000) {
      const result = await supabase.rpc('get_radar_world_activity').order('icao').range(offset, offset + 999);
      if (result.error) throw result.error;
      rows.push(...(result.data ?? []));
      if ((result.data?.length ?? 0) < 1000) return rows;
    }
  },
  staleTime: 15_000,
  refetchInterval: 15_000,
});

export function radarTierQuery(tiers: readonly number[]) {
  return queryOptions({
    queryKey: ['radar-tier-airports', [...tiers].sort()],
    queryFn: async () => {
      const result = await supabase.from('airports').select('*').in('size', [...tiers])
        .order('size', { ascending: false }).order('icao').limit(RADAR_TIER_LIMIT);
      if (result.error) throw result.error;
      return result.data ?? [];
    },
    staleTime: 60_000,
  });
}

/** Priority ports are additive, never discarded by the tier catalogue limit. */
export function radarPortCodes(tierCodes: readonly string[], priorityCodes: readonly string[]) {
  return [...new Set([...tierCodes, ...priorityCodes])].sort();
}

export function radarContextQuery(codes: string[]) {
  return queryOptions({
    queryKey: ['radar-visible-context', codes],
    queryFn: async () => {
      const batches: string[][] = [];
      for (let offset = 0; offset < codes.length; offset += RADAR_CONTEXT_BATCH) batches.push(codes.slice(offset, offset + RADAR_CONTEXT_BATCH));
      const results = await Promise.all(batches.map(async batch => {
        const [airports, metrics, pools] = await Promise.all([
          supabase.from('airports').select('*').in('icao', batch),
          supabase.rpc('radar_airport_metrics', { p_icaos: batch }),
          supabase.from('airport_passenger_pools').select('*').in('airport_icao', batch),
        ]);
        for (const result of [airports, metrics, pools]) if (result.error) throw result.error;
        return { airports: airports.data ?? [], metrics: metrics.data ?? [], pools: pools.data ?? [] };
      }));
      return { airports: results.flatMap(r => r.airports), metrics: results.flatMap(r => r.metrics), pools: results.flatMap(r => r.pools) };
    },
    enabled: codes.length > 0,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });
}
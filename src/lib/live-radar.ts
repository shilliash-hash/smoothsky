import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { flightPosition } from './dispatch-engine';

type RadarRow = Database['public']['Functions']['get_live_radar_flights']['Returns'][number];
type NullableTelemetry = 'last_lat' | 'last_lon' | 'last_altitude_ft' | 'last_groundspeed_kts' | 'last_heading' | 'last_telemetry_at' | 'departed_at' | 'eta_at';
// SQL function result introspection does not preserve nullable expressions.
export type LiveRadarFlight = Omit<RadarRow, NullableTelemetry> & { [K in NullableTelemetry]: RadarRow[K] | null };
export const liveRadarQuery = queryOptions({
  queryKey: ['live-radar-flights'],
  queryFn: async () => {
    const flights: LiveRadarFlight[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.rpc('get_live_radar_flights').order('id').range(offset, offset + 999);
      if (error) throw new Error(error.message);
      flights.push(...(data ?? []));
      if ((data?.length ?? 0) < 1000) break;
    }
    return flights;
  },
  staleTime: 5000,
  refetchInterval: 5000,
});

export function liveRadarProgress(f: Pick<LiveRadarFlight, 'status' | 'departed_at' | 'eta_at'>, now: number) {
  if (f.status !== 'EN_ROUTE' || !f.departed_at || !f.eta_at) return 0;
  const start = Date.parse(f.departed_at), end = Date.parse(f.eta_at);
  return end > start ? Math.min(1, Math.max(0, (now - start) / (end - start))) : 0;
}

export function liveRadarPosition(f: LiveRadarFlight, now: number) {
  if (f.execution_source === 'ACARS_AGENT') {
    if (typeof f.last_lat === 'number' && typeof f.last_lon === 'number' && typeof f.last_heading === 'number'
      && Number.isFinite(f.last_lat) && Number.isFinite(f.last_lon) && Number.isFinite(f.last_heading)
      && Math.abs(f.last_lat) <= 90 && Math.abs(f.last_lon) <= 180 && f.last_heading >= 0 && f.last_heading <= 360) {
      return { lat: f.last_lat, lon: f.last_lon, heading: f.last_heading };
    }
    if (f.status === 'EN_ROUTE') return null;
  }
  return flightPosition({ lat: f.origin_lat, lon: f.origin_lon }, { lat: f.destination_lat, lon: f.destination_lon }, liveRadarProgress(f, now));
}
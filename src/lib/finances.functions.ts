import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';
import { buildFinancialReport, periodStart } from './finances';

async function allPages<T>(fetchPage: (offset: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 500) { const { data, error } = await fetchPage(offset); if (error) throw new Error(error.message); if (!data) throw new Error('Financial data unavailable'); rows.push(...data); if (data.length < 500) return rows; }
}
export const getFinancialReport = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator(z.object({ period: z.enum(['7D', '30D', 'ALL']) }))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const company = await db.from('companies').select('id').eq('user_id', context.userId).eq('is_personal', false).maybeSingle();
    if (company.error) throw new Error(company.error.message);
    if (!company.data) throw new Error('Airline company required');
    const cid = company.data.id;
    const now = new Date().toISOString(); const start = periodStart(data.period, new Date(now));
    const ledgerPage = (offset: number) => { let q = db.from('company_ledger').select('id, created_at, entry_type, company_delta, balance_after, reference, idempotency_key').eq('company_id', cid).lte('created_at', now); if (start) q = q.gte('created_at', start); return q.order('created_at').order('id').range(offset, offset + 499); };
    const [ledger, fleet, flights, bases, missions, opening] = await Promise.all([
      allPages(ledgerPage),
      allPages(offset => db.from('fleet_aircraft').select('id, registration, aircraft_type_id, ownership, lease_deposit, returned_at, type:aircraft_types(model, tier, pax)').eq('company_id', cid).order('id').range(offset, offset + 499)),
      allPages(offset => db.from('flights').select('id, aircraft_id, status, completed_at, origin_icao, destination_icao, passengers, estimated_minutes, estimate, settlement, telemetry, divert_state').eq('company_id', cid).lte('created_at', now).order('id').range(offset, offset + 499)),
      allPages(offset => db.from('company_fobs').select('id, airport_icao, base_type, closed_at').eq('company_id', cid).order('id').range(offset, offset + 499)),
      allPages(offset => db.from('special_missions').select('flight_id').eq('accepted_by', context.userId).not('flight_id', 'is', null).order('id').range(offset, offset + 499)),
      start ? db.from('company_ledger').select('balance_after').eq('company_id', cid).lt('created_at', start).order('created_at', { ascending: false }).order('id', { ascending: false }).limit(1) : Promise.resolve({ data: [], error: null }),
    ]);
    if (opening.error) throw new Error(opening.error.message);
    return buildFinancialReport({ period: data.period, now, ledger, fleet, flights, bases, missionFlights: missions.flatMap(m => m.flight_id ? [m.flight_id] : []), openingBalance: opening.data?.[0]?.balance_after ?? 0 });
  });

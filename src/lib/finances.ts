import type { Json } from '@/integrations/supabase/types';
import { flightDebriefComparison } from './flight-debrief';

export type Period = '7D' | '30D' | 'ALL';
export type LedgerEntry = { id: number; created_at: string; entry_type: string; company_delta: number; balance_after: number; reference: string | null; idempotency_key: string };
export type ReportAircraft = { id: string; registration: string; aircraft_type_id: string; ownership: string; lease_deposit: number; returned_at: string | null; type: { model: string; tier: number; pax: number } | null };
export type ReportFlight = { id: string; aircraft_id: string; status: string; completed_at: string | null; origin_icao: string; destination_icao: string; passengers: number; estimated_minutes: number; estimate: Json; settlement: Json | null; telemetry: Json | null; divert_state: Json | null };
export type ReportBase = { id: string; airport_icao: string; base_type: string; closed_at: string | null };
export type PerformanceRow = { id: string; label: string; model: string; ownership: string; tier: number | null; flights: number; hours: number; revenue: number; expenses: number; fuel: number; leaseMro: number; net: number; perHour: number | null; passengers: number; seats: number; lf: number | null };
export const jsonObject = (value: Json | undefined | null): Record<string, Json | undefined> => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
export const jsonNumber = (value: Json | undefined): number | null => typeof value === 'number' && Number.isFinite(value) ? value : null;
export const ratio = (n: number, d: number) => d > 0 ? n / d * 100 : null;
export function fuelRatioTone(value: number | null) { return value === null ? 'text-muted-foreground' : value < 45 ? 'text-primary' : value <= 65 ? 'text-amber' : 'text-destructive'; }
export function periodStart(period: Period, now: Date) { return period === 'ALL' ? null : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (period === '7D' ? 6 : 29) * 86400000).toISOString(); }
const costTypes: Record<string, string> = { FUEL_EXPENSE: 'Fuel', FUEL_REFUND: 'Fuel', LEASE_PAYMENT: 'Leasing & rentals', SPOT_RENTAL: 'Leasing & rentals', LEASE_TERMINATION_FEE: 'Leasing & rentals', MAINTENANCE_RESERVE: 'Maintenance & repairs', MAINTENANCE: 'Maintenance & repairs', RENTAL_DAMAGE: 'Maintenance & repairs', AIRPORT_FEES: 'Airport & handling', HANDLING_FEES: 'Airport & handling', FOB_UPKEEP: 'FBO upkeep', PILOT_COMMISSION: 'Crew', TYPE_RATING: 'Training' };
const row = (id: string, label: string, model = '', ownership = 'UNATTRIBUTED', tier: number | null = null): PerformanceRow => ({ id, label, model, ownership, tier, flights: 0, hours: 0, revenue: 0, expenses: 0, fuel: 0, leaseMro: 0, net: 0, perHour: null, passengers: 0, seats: 0, lf: null });
function finish(r: PerformanceRow) { r.net = r.revenue - r.expenses; r.perHour = r.hours > 0 ? r.net / r.hours : null; r.lf = ratio(r.passengers, r.seats); return r; }
export function buildFinancialReport(input: { period: Period; now: string; ledger: LedgerEntry[]; fleet: ReportAircraft[]; flights: ReportFlight[]; bases: ReportBase[]; missionFlights: string[]; openingBalance: number }) {
  const start = periodStart(input.period, new Date(input.now));
  const ledger = input.ledger.filter(e => (!start || e.created_at >= start) && e.created_at <= input.now);
  const aircraft = new Map(input.fleet.map(a => [a.id, a]));
  const registrations = new Map(input.fleet.map(a => [a.registration, a]));
  const flights = new Map(input.flights.map(f => [f.id, f]));
  const missions = new Set(input.missionFlights);
  for (const f of input.flights) {
    const plan = jsonObject(jsonObject(f.divert_state)['contract'] ?? f.estimate);
    if (plan['mission_id']) missions.add(f.id);
  }
  const fleet = new Map<string, PerformanceRow>();
  const routes = new Map<string, PerformanceRow>();
  const costs = new Map<string, number>();
  const mix = new Map<string, number>();
  const daily = new Map<string, { day: string; revenue: number; expenses: number; balance: number; cashFlow: number }>();
  const hubs = input.bases.map(b => ({ ...b, upkeep: 0, flights: 0, passengers: 0, planSavings: 0 }));
  let revenue = 0, expenses = 0, hours = 0, count = 0, overburnCost = 0, burnValue = 0, knownBurnFlights = 0;
  const getAircraftRow = (a: ReportAircraft | undefined, id: string) => {
    const key = a?.ownership === 'RENTAL' ? `rental:${a.aircraft_type_id}` : a ? a.id : 'unknown';
    let r = fleet.get(key);
    if (!r) { r = a ? row(key, a.ownership === 'RENTAL' ? `${a.type?.model ?? a.aircraft_type_id} pool` : a.registration, a.type?.model ?? a.aircraft_type_id, a.ownership, a.type?.tier ?? null) : row(key, 'Historical aircraft', 'Identity unavailable', 'UNATTRIBUTED'); fleet.set(key, r); }
    return r;
  };
  const common = row('overhead', 'Company overhead / unassigned', '', 'OVERHEAD');
  for (const a of input.fleet.filter(a => a.returned_at === null)) getAircraftRow(a, a.id);
  const first = start ?? input.ledger[0]?.created_at ?? input.now;
  const cursor = new Date(first.slice(0, 10) + 'T00:00:00Z');
  const end = new Date(input.now);
  for (; cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) { const day = cursor.toISOString().slice(0, 10); daily.set(day, { day, revenue: 0, expenses: 0, balance: 0, cashFlow: 0 }); }
  for (const f of input.flights) {
    if (f.status !== 'COMPLETED' || !f.completed_at || (start && f.completed_at < start) || f.completed_at > input.now) continue;
    const a = aircraft.get(f.aircraft_id);
    const r = getAircraftRow(a, f.aircraft_id);
    const comparison = flightDebriefComparison({ settlement: f.settlement, estimate: f.estimate, telemetry: f.telemetry, divertState: f.divert_state, estimatedMinutes: f.estimated_minutes });
    const fh = Math.max(0, comparison.finalMinutes ?? f.estimated_minutes) / 60;
    const final = jsonObject(f.settlement);
    const plan = jsonObject(jsonObject(f.divert_state)['contract'] ?? f.estimate);
    const key = `${f.origin_icao} → ${f.destination_icao}`;
    let route = routes.get(key); if (!route) { route = row(key, key); routes.set(key, route); }
    for (const target of [r, route]) { target.flights++; target.hours += fh; if (!Boolean(plan['all_cargo']) && !missions.has(f.id) && a?.type && a.type.pax > 0) { target.passengers += f.passengers; target.seats += a.type.pax; } }
    count++; hours += fh;
    if (comparison.finalFuelCost !== null) burnValue += comparison.finalFuelCost;
    if (comparison.actualFuelGal !== null && comparison.plannedFuelGal !== null) {
      knownBurnFlights++;
      const price = jsonNumber(plan['fuel_price_per_gal']);
      const discount = jsonNumber(jsonObject(plan['fob_discounts'])['fuel']) ?? 0;
      if (price !== null) overburnCost += Math.max(0, comparison.actualFuelGal - comparison.plannedFuelGal) * price * (1 - discount);
    }
    const touched = hubs.filter(b => b.airport_icao === f.origin_icao || b.airport_icao === f.destination_icao);
    const savings = jsonNumber(jsonObject(plan['fob_discounts'])['savings']) ?? 0;
    for (const b of touched) { b.flights++; b.passengers += f.passengers; b.planSavings += savings / touched.length; }
    // Revenue mix uses posted cash, not estimate totals; final used below for its proportions.
    void final;
  }
  let balance = input.openingBalance;
  for (const e of ledger) {
    const point = daily.get(e.created_at.slice(0, 10));
    balance = e.balance_after;
    if (point) { point.balance = balance; point.cashFlow += e.company_delta; }
    const f = e.reference ? flights.get(e.reference) : undefined;
    const sessionId = e.idempotency_key.match(/^spot_(?:rental|deposit):([^:]+)/)?.[1];
    const a = f ? aircraft.get(f.aircraft_id) : (e.reference ? registrations.get(e.reference) ?? aircraft.get(e.reference) : undefined) ?? (sessionId ? aircraft.get(sessionId) : undefined);
    const r = f || a || sessionId ? getAircraftRow(a, f?.aircraft_id ?? sessionId ?? a?.id ?? '') : common;
    const route = f ? routes.get(`${f.origin_icao} → ${f.destination_icao}`) : undefined;
    const group = costTypes[e.entry_type];
    if (group) {
      const cost = -e.company_delta;
      expenses += cost; r.expenses += cost; if (route) route.expenses += cost;
      costs.set(group, (costs.get(group) ?? 0) + cost); if (point) point.expenses += cost;
      if (group === 'Fuel') r.fuel += cost;
      if (group === 'Leasing & rentals' || group === 'Maintenance & repairs') r.leaseMro += cost;
      if (e.entry_type === 'FOB_UPKEEP') { const hub = hubs.find(b => b.id === e.reference); if (hub) hub.upkeep += cost; }
    } else if (e.entry_type === 'TICKET_REVENUE' || e.entry_type === 'PASSENGER_TIP') {
      const value = e.company_delta; revenue += value; r.revenue += value; if (route) route.revenue += value; if (point) point.revenue += value;
      if (e.entry_type === 'PASSENGER_TIP') mix.set('Landing tips', (mix.get('Landing tips') ?? 0) + value);
      else if (f && missions.has(f.id)) mix.set('Special missions', (mix.get('Special missions') ?? 0) + value);
      else {
        const final = jsonObject(f?.settlement); const cargo = jsonNumber(final['cargo_revenue']); const ticket = jsonNumber(final['ticket_revenue']);
        if (cargo !== null && ticket !== null && cargo + ticket > 0) { const c = value * cargo / (cargo + ticket); mix.set('Cargo', (mix.get('Cargo') ?? 0) + c); mix.set('Standard PAX', (mix.get('Standard PAX') ?? 0) + value - c); }
        else mix.set('Unclassified flight revenue', (mix.get('Unclassified flight revenue') ?? 0) + value);
      }
    }
  }
  let carry = input.openingBalance;
  const transactionDays = new Set(ledger.map(e => e.created_at.slice(0, 10)));
  const points = [...daily.values()].map(p => { if (transactionDays.has(p.day)) carry = p.balance; else p.balance = carry; return p; });
  const weekly = new Map<string, typeof points[number]>();
  if (input.period === 'ALL') for (const p of points) { const d = new Date(p.day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); const key = d.toISOString().slice(0, 10); const old = weekly.get(key); if (old) { old.revenue += p.revenue; old.expenses += p.expenses; old.cashFlow += p.cashFlow; old.balance = p.balance; } else weekly.set(key, { ...p, day: key }); }
  if (common.revenue || common.expenses) fleet.set(common.id, common);
  const rows = [...fleet.values()].map(finish).sort((a, b) => b.net - a.net);
  const tiers = new Map<string, PerformanceRow>();
  for (const r of rows) { const key = r.tier === null ? 'Unassigned' : r.tier >= 4 ? 'Tier 4+' : `Tier ${r.tier}`; let t = tiers.get(key); if (!t) { t = row(key, key); tiers.set(key, t); } for (const k of ['revenue', 'expenses', 'fuel', 'leaseMro', 'hours', 'flights', 'passengers', 'seats'] as const) t[k] += r[k]; }
  const net = revenue - expenses;
  return { generatedAt: input.now, period: input.period, start, revenue, expenses, net, margin: ratio(net, revenue), hours, flights: count, perHour: hours > 0 ? net / hours : null, fuelSpend: costs.get('Fuel') ?? 0, fuelRatio: ratio(costs.get('Fuel') ?? 0, revenue), deposits: input.fleet.filter(a => !a.returned_at && (a.ownership === 'LEASED' || a.ownership === 'RENTAL')).reduce((sum, a) => sum + a.lease_deposit, 0), balance, overburnCost, burnValue, knownBurnFlights, points: input.period === 'ALL' ? [...weekly.values()] : points, revenueMix: [...mix].map(([name, value]) => ({ name, value })), costMix: [...costs].map(([name, value]) => ({ name, value })), fleet: rows, tiers: [...tiers.values()].map(finish), routes: [...routes.values()].map(finish).sort((a, b) => b.net / Math.max(1, b.flights) - a.net / Math.max(1, a.flights)), hubs };
}
export type FinancialReport = ReturnType<typeof buildFinancialReport>;

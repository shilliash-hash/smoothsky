import { describe, it, expect } from 'vitest';
import { buildFinancialReport, fuelRatioTone, periodStart, type LedgerEntry, type ReportAircraft, type ReportFlight } from './finances';
const now = '2026-11-28T12:00:00.000Z';
const aircraft: ReportAircraft = { id: 'a', registration: 'SP-ONE', aircraft_type_id: 'C172', ownership: 'OWNED', lease_deposit: 0, returned_at: null, type: { model: 'C172', tier: 1, pax: 4 } };
const flight: ReportFlight = { id: 'f', aircraft_id: 'a', status: 'COMPLETED', completed_at: now, origin_icao: 'EPGD', destination_icao: 'EPWA', passengers: 2, estimated_minutes: 10, settlement: { minutes: 120, ticket_revenue: 800, cargo_revenue: 200, actual_fuel_used_gal: 20, fuel_cost: 100 }, estimate: { fuel_price_per_gal: 5, weight_budget: { trip_fuel_gal: 15, reserve_fuel_gal: 5 } }, telemetry: null, divert_state: null };
const entry = (id: number, entry_type: string, company_delta: number, reference: string | null = 'f'): LedgerEntry => ({ id, entry_type, company_delta, reference, created_at: now, balance_after: 1000, idempotency_key: `key:${id}` });
const report = (ledger: LedgerEntry[], fleet = [aircraft], flights = [flight]) => buildFinancialReport({ period: '7D', now, ledger, fleet, flights, bases: [], missionFlights: [], openingBalance: 0 });
describe('Fuel ratio thresholds calibrated to SmoothSky', () => {
  it('below 45 is emerald', () => expect(fuelRatioTone(44.999)).toBe('text-primary'));
  it('45 is amber', () => expect(fuelRatioTone(45)).toBe('text-amber'));
  it('65 is amber', () => expect(fuelRatioTone(65)).toBe('text-amber'));
  it('above 65 is red', () => expect(fuelRatioTone(65.001)).toBe('text-destructive'));
  it('56.8 is healthy amber', () => expect(fuelRatioTone(56.8)).toBe('text-amber'));
});
describe('Financial report accounting', () => {
  it('includes rental fee and damage while excluding refundable deposits', () => {
    const rental = { ...aircraft, ownership: 'RENTAL', lease_deposit: 190 };
    const r = report([entry(1, 'TICKET_REVENUE', 1000), entry(2, 'FUEL_EXPENSE', -200), entry(3, 'SPOT_RENTAL', -190, 'SP-ONE'), entry(4, 'RENTAL_DAMAGE', -50), entry(5, 'LEASE_DEPOSIT', -190), entry(6, 'LEASE_DEPOSIT_REFUND', 190)], [rental]);
    expect(r.net).toBe(560); expect(r.deposits).toBe(190); expect(r.fleet[0]?.ownership).toBe('RENTAL'); expect(r.fleet[0]?.net).toBe(560);
  });
  it('aggregates returned spot rentals by type', () => {
    const a = { ...aircraft, ownership: 'RENTAL', returned_at: now }; const b = { ...a, id: 'b', registration: 'SP-TWO' };
    const r = report([entry(1, 'SPOT_RENTAL', -190, 'SP-ONE'), entry(2, 'SPOT_RENTAL', -190, 'SP-TWO')], [a, b], []);
    expect(r.fleet).toHaveLength(1); expect(r.fleet[0]?.expenses).toBe(380);
  });
  it('includes common FBO costs in exact company reconciliation', () => {
    const r = report([entry(1, 'TICKET_REVENUE', 1000), entry(2, 'FOB_UPKEEP', -150, 'base')]);
    expect(r.net).toBe(850); expect(r.fleet.reduce((s, a) => s + a.net, 0)).toBe(850); expect(r.tiers.reduce((s, a) => s + a.net, 0)).toBe(850);
  });
  it('fuel cancellation refund nets to zero', () => { const r = report([entry(1, 'FUEL_EXPENSE', -200), entry(2, 'FUEL_REFUND', 200)]); expect(r.fuelSpend).toBe(0); expect(r.net).toBe(0); });
  it('excludes capital, FBO assets and pilot funding transfers', () => { const r = report([entry(1, 'INITIAL_GRANT', 30000), entry(2, 'AIRCRAFT_PURCHASE', -5000), entry(3, 'FOB_SETUP', -1000), entry(4, 'FOB_MODULE', -500), entry(5, 'PILOT_FUNDING_REFUND', -300)]); expect(r.revenue).toBe(0); expect(r.expenses).toBe(0); });
  it('uses logged hours and weighted passenger LF', () => { const r = report([entry(1, 'TICKET_REVENUE', 1000)], [aircraft], [flight, { ...flight, id: 'f2', passengers: 0 }]); expect(r.hours).toBe(4); expect(r.perHour).toBe(250); expect(r.tiers[0]?.lf).toBe(25); });
  it('does not double count overburn or tank purchases as burn', () => { const r = report([entry(1, 'FUEL_EXPENSE', -300)]); expect(r.fuelSpend).toBe(300); expect(r.burnValue).toBe(100); expect(r.overburnCost).toBe(0); });
  it('retains money when a pooled airframe is no longer visible', () => { const r = report([entry(1, 'TICKET_REVENUE', 1000)], [], [flight]); expect(r.net).toBe(1000); expect(r.fleet[0]?.net).toBe(1000); expect(r.fleet[0]?.tier).toBeNull(); });
  it('revenue mix reconciles exactly', () => { const r = report([entry(1, 'TICKET_REVENUE', 1000), entry(2, 'PASSENGER_TIP', 50)]); expect(r.revenueMix.reduce((s, x) => s + x.value, 0)).toBe(1050); expect(r.revenueMix.find(x => x.name === 'Cargo')?.value).toBe(200); });
  it('frozen special mission revenue is not classified as ordinary PAX', () => { const r = report([entry(1, 'TICKET_REVENUE', 1000)], [aircraft], [{ ...flight, estimate: { mission_id: 'mission' } }]); expect(r.revenueMix).toEqual([{ name: 'Special missions', value: 1000 }]); expect(r.tiers[0]?.lf).toBeNull(); });
  it('preserves opening cash across idle days', () => { const r = buildFinancialReport({ period: '7D', now, ledger: [], fleet: [], flights: [], bases: [], missionFlights: [], openingBalance: 1234 }); expect(r.points).toHaveLength(7); expect(r.points.every(p => p.balance === 1234)).toBe(true); });
  it('7D and 30D include today and use UTC boundaries', () => { expect(periodStart('7D', new Date(now))).toBe('2026-11-22T00:00:00.000Z'); expect(periodStart('30D', new Date(now))).toBe('2026-10-30T00:00:00.000Z'); });
});
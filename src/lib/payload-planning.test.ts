import { describe, expect, it } from 'vitest';
import { bestPayloadMix, payloadPlanning } from './payload-planning';
import type { Quote } from './operations';

const q: Quote = {
  distance_nm: 100, minutes: 60, passengers: 8, cargo_kg: 0,
  revenue: 800, ticket_revenue: 800, fuel_gal: 100, fuel_cost: 580,
  landing_fee: 20, handling_fee: 80, maintenance: 10, net: 110,
  rules: { fare_per_nm: 0.18, charter_by_tier: [65, 50, 35, 20, 0, 0, 0] },
  payload_limits: { max_passengers: 8, max_cargo_kg: 350, ticket_unit_revenue: 100, cargo_unit_revenue: 0.6, handling_rate_effective: 0.1 },
  weight_budget: { empty_weight_kg: 1000, mtow_kg: 2200, planned_fuel_gal: 100, planned_fuel_kg: 300, fuel_kg_per_gal: 3, available_payload_kg: 900, passenger_weight_kg: 80, fuel_capacity_gal: 400, trip_fuel_gal: 80, reserve_fuel_gal: 20, min_safe_fuel_gal: 100, fuel_billing_floor_pct: 0.8, landing_fee_per_ton_mtow: 2.5 },
  tank: { persistent: true, current_fuel_gal: 100, min_target_gal: 100, target_fuel_gal: 100, max_target_gal: 400, added_fuel_gal: 0, uplift_cost: 0, fuel_price_effective_per_gal: 5.8 },
};
describe('live payload planning', () => {
  it('caps cargo at 260 kg with 8 × 80 kg passengers and 900 kg payload', () => {
    const p = payloadPlanning(q, 'commercial', 8, 350, null);
    expect(p?.cargoKg).toBe(260);
    expect(p?.quote.weight_budget?.takeoff_weight_kg).toBe(2200);
    expect(p?.remaining).toBe(0);
  });
  it('caps passengers at six when 350 kg cargo occupies the payload', () => {
    expect(payloadPlanning(q, 'commercial', 6, 350, null)?.maxPax).toBe(6);
  });
  it('respects zero passengers rather than auto-loading eight', () => {
    expect(payloadPlanning(q, 'commercial', 0, 350, null)?.quote.ticket_revenue).toBe(0);
  });
  it('reduces payload live when target fuel rises to 200 gallons', () => {
    const p = payloadPlanning(q, 'commercial', 8, 0, 200);
    expect(p?.passengers).toBe(7);
    expect(p?.remaining).toBe(40);
    expect(p?.quote.tank?.uplift_cost).toBe(580);
  });
  it('All-Cargo locks passengers at zero', () => {
    expect(payloadPlanning(q, 'cargo', 8, 350, null)?.passengers).toBe(0);
  });
  it('Ferry locks both sliders at zero', () => {
    const p = payloadPlanning(q, 'ferry', 8, 350, null);
    expect([p?.passengers, p?.cargoKg, p?.maxPax, p?.maxCargo]).toEqual([0, 0, 0, 0]);
  });
  it('chooses the maximum contribution margin across all feasible mixes', () => {
    expect(bestPayloadMix(q, 'commercial', null)).toEqual({ passengers: 8, cargoKg: 260 });
    const expensiveCargo = { ...q, payload_limits: { ...q.payload_limits, max_passengers: 8, max_cargo_kg: 900, ticket_unit_revenue: 100, cargo_unit_revenue: 2, handling_rate_effective: 0.1 } };
    expect(bestPayloadMix(expensiveCargo, 'commercial', null)).toEqual({ passengers: 0, cargoKg: 900 });
  });
  it('matches live tickets, cargo, handling and net for selected load', () => {
    const p = payloadPlanning(q, 'commercial', 4, 200, null);
    expect([p?.quote.ticket_revenue, p?.quote.cargo_revenue, p?.quote.handling_fee, p?.quote.net]).toEqual([400, 120, 52, -142]);
  });
  it('limits to airport availability rather than the full hold and seats', () => {
    const limited = { ...q, payload_limits: { max_passengers: 2, max_cargo_kg: 55, ticket_unit_revenue: 100, cargo_unit_revenue: 0.6, handling_rate_effective: 0.1 } };
    const p = payloadPlanning(limited, 'commercial', 8, 350, null);
    expect([p?.passengers, p?.cargoKg]).toEqual([2, 55]);
  });
  const rental = { ...q, tank: { ...q.tank, persistent: false, current_fuel_gal: 0, min_target_gal: 100, target_fuel_gal: 100, max_target_gal: 400, added_fuel_gal: 100, uplift_cost: 0, fuel_price_effective_per_gal: 5.8 } };
  it('spot rental 300 gal target consumes MTOW: 3 PAX + 60 kg cargo instead of 4 PAX + 200 kg, 0 SC up front', () => {
    const p = payloadPlanning(rental, 'commercial', 4, 200, 300);
    expect(p?.quote.weight_budget?.planned_fuel_gal).toBe(300);
    expect([p?.passengers, p?.cargoKg]).toEqual([3, 60]);
    expect(p?.quote.tank?.uplift_cost).toBe(0);
  });
  it('spot rental target below trip + reserve is raised to the 100 gal minimum', () => {
    expect(payloadPlanning(rental, 'commercial', 4, 200, 50)?.quote.weight_budget?.planned_fuel_gal).toBe(100);
  });
});
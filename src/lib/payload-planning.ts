import type { Quote } from './operations';
import type { FlightMode } from './flight-mode';

const money = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export function payloadPlanning(q: Quote, mode: FlightMode, passengers: number | null, cargoKg: number, targetFuel: number | null) {
  const wb = q.weight_budget;
  const limits = q.payload_limits;
  if (!wb || !limits) return null;
  const fuelGal = q.tank?.persistent ? Math.max(q.tank.min_target_gal, targetFuel ?? q.tank.target_fuel_gal) : Number(wb.planned_fuel_gal ?? 0);
  const fuelKg = fuelGal * Number(wb.fuel_kg_per_gal ?? 0);
  const capacity = Math.max(0, wb.mtow_kg - wb.empty_weight_kg - fuelKg);
  const paxWeight = wb.passenger_weight_kg;
  const paxLimit = mode === 'commercial' ? Math.max(0, Math.floor(limits.max_passengers)) : 0;
  const cargoLimit = mode === 'ferry' ? 0 : Math.max(0, Math.floor(limits.max_cargo_kg));
  const pax = Math.min(paxLimit, Math.max(0, Math.floor(passengers ?? q.passengers)), Math.floor(capacity / paxWeight));
  const cargo = Math.min(cargoLimit, Math.max(0, Math.floor(cargoKg)), Math.floor(Math.max(0, capacity - pax * paxWeight)));
  const maxPax = Math.min(paxLimit, Math.floor(Math.max(0, capacity - cargo) / paxWeight));
  const maxCargo = Math.min(cargoLimit, Math.floor(Math.max(0, capacity - pax * paxWeight)));
  const ticket = money(pax * limits.ticket_unit_revenue);
  const cargoRevenue = money(cargo * limits.cargo_unit_revenue);
  const revenue = ticket + cargoRevenue;
  const handling = money(revenue * limits.handling_rate_effective);
  const payload = pax * paxWeight + cargo;
  const budget = { ...wb, planned_fuel_gal: fuelGal, planned_fuel_kg: fuelKg, available_payload_kg: capacity, payload_kg: payload, takeoff_weight_kg: wb.empty_weight_kg + fuelKg + payload, remaining_payload_kg: capacity - payload };
  const tank = q.tank ? { ...q.tank, target_fuel_gal: fuelGal, max_target_gal: Math.max(fuelGal, Math.min(Number(wb.fuel_capacity_gal ?? fuelGal), (wb.mtow_kg - wb.empty_weight_kg - payload) / Number(wb.fuel_kg_per_gal))), added_fuel_gal: Math.max(0, fuelGal - q.tank.current_fuel_gal), uplift_cost: q.tank.persistent ? money(Math.max(0, fuelGal - q.tank.current_fuel_gal) * q.tank.fuel_price_effective_per_gal) : 0 } : undefined;
  const quote: Quote = { ...q, passengers: pax, cargo_kg: cargo, ticket_revenue: ticket, cargo_revenue: cargoRevenue, revenue, handling_fee: handling, net: money(revenue - q.fuel_cost - q.landing_fee - handling - q.maintenance), weight_budget: budget, ...(tank ? { tank } : {}) };
  return { quote, passengers: pax, cargoKg: cargo, maxPax, maxCargo, capacity, paxLimit, cargoLimit, remaining: capacity - payload };
}

/** Compare every feasible cabin load; cargo fills the remaining payload, ties favour passengers. */
export function bestPayloadMix(q: Quote, mode: FlightMode, targetFuel: number | null) {
  const planning = payloadPlanning(q, mode, 0, 0, targetFuel);
  if (!planning) return { passengers: 0, cargoKg: 0 };
  let best = { passengers: 0, cargoKg: 0, net: Number.NEGATIVE_INFINITY };
  for (let pax = 0; pax <= planning.maxPax; pax++) {
    const cargo = Math.min(planning.cargoLimit, Math.floor(Math.max(0, planning.capacity - pax * Number(q.weight_budget?.passenger_weight_kg))));
    const p = payloadPlanning(q, mode, pax, cargo, targetFuel);
    if (p && p.quote.net >= best.net) best = { passengers: pax, cargoKg: cargo, net: p.quote.net };
  }
  return { passengers: best.passengers, cargoKg: best.cargoKg };
}
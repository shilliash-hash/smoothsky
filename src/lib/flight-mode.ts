export type FlightMode = "commercial" | "cargo" | "ferry";

export function flightModePayload(mode: FlightMode, cargoKg: number, capacity: number) {
  const maximum = Math.max(0, Math.floor(capacity));
  if (mode === "ferry") return { allCargo: true, cargoKg: 0 };
  const minimum = mode === "cargo" ? Math.min(10, maximum) : 0;
  return { allCargo: mode === "cargo", cargoKg: Math.min(maximum, Math.max(minimum, cargoKg)) };
}

export function flightModeRange(mode: FlightMode, rangeNm: number, usableRangePct: number) {
  return Math.floor(rangeNm * (mode === "ferry" ? 1 : usableRangePct));
}

export function commercialRangeError(error: string) {
  return /(?:usable|commercial) payload range|commercial range/i.test(error);
}

export function canDispatchPayload(mode: FlightMode, passengers: number, cargoKg: number) {
  return mode === "ferry" ? passengers === 0 && cargoKg === 0 : passengers > 0 || cargoKg > 0;
}
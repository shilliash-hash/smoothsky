export type FlightTransaction = {
  registration: string | null;
  flight_id: string | null;
  flight_number: string | null;
  origin_icao: string | null;
  destination_icao: string | null;
  description: string;
};

export function flightTransactionContext(entry: FlightTransaction): string | null {
  if (!entry.flight_id || !entry.flight_number || !entry.registration || !entry.origin_icao || !entry.destination_icao) return null;
  return `${entry.flight_number} · ${entry.registration} · ${entry.origin_icao} → ${entry.destination_icao}`;
}
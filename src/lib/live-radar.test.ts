import { describe, expect, it } from 'vitest';
import { liveRadarPosition, liveRadarProgress, type LiveRadarFlight } from './live-radar';

const flight: LiveRadarFlight = {
  id: 'flight', route_waypoints: null, flight_number: 'SKY101', status: 'EN_ROUTE', execution_source: 'ACARS_AGENT',
  origin_icao: 'EPWA', destination_icao: 'CYYR', origin_lat: 52, origin_lon: 21,
  destination_lat: 53, destination_lon: -60, last_lat: 55, last_lon: -20,
  last_heading: 270, last_altitude_ft: 30000, last_groundspeed_kts: 400,
  last_telemetry_at: '2026-11-20T12:00:00Z', departed_at: '2026-11-20T10:00:00Z',
  eta_at: '2026-11-20T14:00:00Z', airline_name: 'Other airline', aircraft_model: 'C172', registration: 'N-ABCD', is_own: false,
};
describe('world live radar', () => {
  it('places other-company ACARS at GPS regardless of elapsed simulation time', () => {
    expect(liveRadarPosition(flight, Date.parse('2026-11-21T12:00:00Z'))).toEqual({ lat: 55, lon: -20, heading: 270 });
  });
  it('never invents an airborne ACARS position without telemetry', () => {
    expect(liveRadarPosition({ ...flight, last_lat: null }, Date.now())).toBeNull();
  });
  it('places dispatched flights at origin without telemetry', () => {
    expect(liveRadarPosition({ ...flight, status: 'DISPATCHED', last_lat: null }, Date.now())).toMatchObject({ lat: 52, lon: 21 });
  });
  it('interpolates web flights using their frozen ETA', () => {
    expect(liveRadarProgress(flight, Date.parse('2026-11-20T12:00:00Z'))).toBe(0.5);
  });
});
/** ACARS counts as online when the client reported within the last two minutes. */
export const ACARS_ONLINE_MS = 2 * 60 * 1000;
export const ACARS_RESUME_MS = 30 * 60 * 1000;
export const simulationControlsVisible = (webEnabled: boolean, isAdmin: boolean) => webEnabled || isAdmin;
export function acarsLink(lastSeen: string | null | undefined, now: number) {
  const timestamp = lastSeen ? Date.parse(lastSeen) : NaN;
  const age = Number.isFinite(timestamp) ? Math.max(0, now - timestamp) : Infinity;
  return { online: age <= ACARS_ONLINE_MS, canResume: age < ACARS_RESUME_MS, minutesLeft: Math.max(0, Math.ceil((ACARS_RESUME_MS - age) / 60000)) };
}
export function acarsLive(telemetry: unknown): Record<string, unknown> | null {
  if (!telemetry || typeof telemetry !== 'object' || !('live' in telemetry)) return null;
  const live = telemetry.live;
  return live && typeof live === 'object' && !Array.isArray(live) ? live as Record<string, unknown> : null;
}
export function acarsGps(telemetry: unknown) {
  const live = acarsLive(telemetry);
  if (!live || typeof live['lat'] !== 'number' || typeof live['lon'] !== 'number' || typeof live['heading'] !== 'number') return null;
  const lat = live['lat'], lon = live['lon'], heading = live['heading'];
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(heading) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || heading < 0 || heading > 360) return null;
  return { lat, lon, heading };
}
export function acarsLinkLabel(status: string, telemetry: unknown, departedAt: string | null, now: number) {
  if (status === 'DISPATCHED') return 'AWAITING ACARS';
  const live = acarsLive(telemetry);
  const lastSeen = typeof live?.['received_at'] === 'string' ? live['received_at'] : departedAt;
  const link = acarsLink(lastSeen, now);
  return link.online ? 'LIVE ACARS · EN ROUTE' : link.canResume ? `ACARS LINK LOST · ${link.minutesLeft}m left to resume` : 'ACARS LINK LOST · Resume window expired — use Cancel flight';
}
export function acarsOnline(lastSeen: string | null | undefined, now: number): boolean {
  if (!lastSeen) return false;
  const t = Date.parse(lastSeen);
  return Number.isFinite(t) && now - t >= -60_000 && now - t <= ACARS_ONLINE_MS;
}
export function maskKey(key: string): string {
  return key.length <= 12 ? "••••" : `${key.slice(0, 6)}••••••••••••${key.slice(-4)}`;
}

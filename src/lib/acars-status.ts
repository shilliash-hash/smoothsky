/** ACARS counts as online when the client reported within the last two minutes. */
export const ACARS_ONLINE_MS = 2 * 60 * 1000;
export function acarsOnline(lastSeen: string | null | undefined, now: number): boolean {
  if (!lastSeen) return false;
  const t = Date.parse(lastSeen);
  return Number.isFinite(t) && now - t >= -60_000 && now - t <= ACARS_ONLINE_MS;
}
export function maskKey(key: string): string {
  return key.length <= 12 ? "••••" : `${key.slice(0, 6)}••••••••••••${key.slice(-4)}`;
}

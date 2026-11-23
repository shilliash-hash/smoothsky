export function rankMovement(rank: number, previous: number | null) {
  if (previous === null) return { label: "NEW", tone: "text-muted-foreground" };
  const change = previous - rank;
  return change > 0
    ? { label: `▲ ${change}`, tone: "text-success" }
    : change < 0
      ? { label: `▼ ${Math.abs(change)}`, tone: "text-destructive" }
      : { label: "—", tone: "text-muted-foreground" };
}

// The public RPC supplies active FBOs only; handling is included in every FBO.
export function dossierBases<T extends { icao: string; handling: boolean }>(hubIcao: string, bases: readonly T[]) {
  const normalizedHub = hubIcao.trim().toUpperCase();
  const active = bases.map(base => ({ ...base, handling: true }));
  return {
    hubBase: active.find(base => base.icao.trim().toUpperCase() === normalizedHub),
    satellites: active.filter(base => base.icao.trim().toUpperCase() !== normalizedHub),
  };
}
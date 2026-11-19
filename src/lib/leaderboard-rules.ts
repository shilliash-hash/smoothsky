export function rankMovement(rank: number, previous: number | null) {
  if (previous === null) return { label: "NEW", tone: "text-muted-foreground" };
  const change = previous - rank;
  return change > 0
    ? { label: `▲ ${change}`, tone: "text-success" }
    : change < 0
      ? { label: `▼ ${Math.abs(change)}`, tone: "text-destructive" }
      : { label: "—", tone: "text-muted-foreground" };
}
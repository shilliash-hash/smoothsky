// Aggregate activity can include airports absent from the owner's private flight list.
export function operationalAirportCodes(
  metrics: readonly { icao: string; operations_7d: number | string }[],
  ownerAirports: Iterable<string>,
) {
  const needed = new Set(ownerAirports);
  for (const metric of metrics) {
    if (Number(metric.operations_7d) > 0) needed.add(metric.icao);
  }
  return [...needed];
}
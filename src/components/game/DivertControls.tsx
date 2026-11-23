import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigation, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FuelTankPanel } from "./FuelTankPanel";
import { WeightBalancePanel } from "./WeightBalancePanel";
import { divertAction } from "@/lib/operations.functions";
import { readDivertState } from "@/lib/divert";
import type { Quote } from "@/lib/operations";
import { formatCr } from "@/lib/rules";

export function DivertControls({ flight, destination, state: raw }: { flight: string; destination: string; state: unknown }) {
  const state = readDivertState(raw);
  const act = useServerFn(divertAction);
  const qc = useQueryClient();
  const [target, setTarget] = useState<number | null>(null);
  const [debounced, setDebounced] = useState<number | null>(null);
  const [confirmAbandon, setConfirmAbandon] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(target), 300); return () => clearTimeout(t); }, [target]);
  const { data: quote, error, isFetching } = useQuery({
    queryKey: ["divert-quote", flight, state?.airport, state?.legs.length, debounced],
    queryFn: async () => await act({ data: { flight, action: "quote", ...(debounced !== null ? { targetFuelGal: debounced } : {}) } }) as unknown as Quote,
    enabled: state !== null,
    refetchInterval: 15000,
  });
  async function run(action: "continue" | "abandon") {
    setBusy(true);
    try {
      await act({ data: { flight, action, ...(action === "continue" && target !== null ? { targetFuelGal: target } : {}) } });
      setConfirmAbandon(false);
      await qc.invalidateQueries();
      toast.success(action === "continue" ? "Continuation ready — connect ACARS or start the test flight" : "Contract abandoned — aircraft released at alternate airport");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Flight action failed"); }
    finally { setBusy(false); }
  }
  if (!state) return null;
  const spent = state.legs.reduce((sum, leg) => sum + leg.fuel_cost + leg.landing_fee, 0);
  return <section aria-label="Diverted contract" className="w-full border-l-2 border-amber bg-panel p-4">
    <div className="flex flex-wrap justify-between gap-3">
      <div><p className="readout text-sm text-amber">DIVERTED · {state.airport} → {destination}</p>
        <p className="mt-2 text-xs text-muted-foreground">Locked aboard: {state.contract.passengers} PAX · {state.contract.cargo_kg ?? 0} kg cargo</p>
        <p className="mt-1 text-xs text-muted-foreground">Revenue on hold {formatCr(state.contract.revenue)} · Landed legs {formatCr(spent)}</p>
        {state.deadline_at && <p className="readout mt-2 text-xs text-amber">Delivery deadline · {new Date(state.deadline_at).toISOString().slice(0,16).replace("T"," ")} UTC</p>}
      </div>
      <Button size="sm" variant="outline" className="text-destructive" disabled={busy} onClick={() => setConfirmAbandon(true)}><X className="h-4 w-4" />Abandon contract</Button>
    </div>
    {quote?.tank && <FuelTankPanel tank={quote.tank} value={target ?? quote.tank.target_fuel_gal} onChange={setTarget} market={quote.fuel_market} />}
    {quote?.weight_budget && <WeightBalancePanel budget={quote.weight_budget} passengers={quote.passengers} cargoKg={quote.cargo_kg ?? 0} canAutoLoad={false} onAutoLoad={() => {}} />}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error.message}</p>}
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      {quote && <p className="readout text-xs text-muted-foreground">{Math.round(quote.distance_nm)} NM · {Math.round(quote.minutes)} min · Landing {formatCr(quote.landing_fee)} · Contract net {formatCr(quote.net)}</p>}
      <Button disabled={busy || isFetching || !quote || error !== null || target !== debounced} onClick={() => run("continue")}>
        {busy || isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}Continue leg to {destination}
      </Button>
    </div>
    <Dialog open={confirmAbandon} onOpenChange={setConfirmAbandon}><DialogContent><DialogHeader>
      <DialogTitle>Abandon contract?</DialogTitle>
      <DialogDescription>No ticket or mission revenue will be paid. Fuel and landing costs remain. The aircraft stays at {state.airport}{quote?.tank?.persistent === false ? " and the spot rental ends" : " and becomes available"}.</DialogDescription>
    </DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setConfirmAbandon(false)}>Keep contract</Button><Button variant="destructive" disabled={busy} onClick={() => run("abandon")}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Abandon contract</Button></div></DialogContent></Dialog>
  </section>;
}
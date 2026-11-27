import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { performMaintenance, quoteMaintenance, type MaintenanceKind, type MaintenanceQuote } from "@/lib/fleet.functions";
import { maintenanceStatusLabel, reliabilityBand, type MaintenanceState } from "@/lib/maintenance";
import { formatCr } from "@/lib/rules";

const kinds: { kind: MaintenanceKind; label: string }[] = [{ kind: "A", label: "A-Check" }, { kind: "C", label: "C-Check" }, { kind: "D", label: "D-Check" }, { kind: "MECHANIC", label: "Fly-in Mechanic" }];

export function MaintenancePanel({ aircraft, state, idle }: { aircraft: string; state: MaintenanceState; idle: boolean }) {
  const [open, setOpen] = useState(false);
  const [quotes, setQuotes] = useState<MaintenanceQuote[] | null>(null);
  const [busy, setBusy] = useState(false);
  const quote = useServerFn(quoteMaintenance), perform = useServerFn(performMaintenance);
  const qc = useQueryClient();
  if (state.reliability_pct == null) return null;
  const rel = Number(state.reliability_pct), status = state.maintenance_status ?? "OPERATIONAL";
  const show = async () => {
    setOpen(true); setQuotes(null);
    try { setQuotes(await Promise.all(kinds.map(k => quote({ data: { aircraft, kind: k.kind } })))); } catch (e) { toast.error(e instanceof Error ? e.message : "Quote failed"); }
  };
  const run = async (kind: MaintenanceKind) => {
    setBusy(true);
    try { await perform({ data: { aircraft, kind } }); toast.success("Maintenance completed"); setOpen(false); await qc.invalidateQueries(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Maintenance failed"); } finally { setBusy(false); }
  };
  return <div className="mt-3 border-t border-border pt-3">
    <div className="readout flex items-center justify-between text-xs">
      <span className="text-muted-foreground">Reliability · {reliabilityBand(rel)}</span>
      <span className={status === "OPERATIONAL" ? "text-success" : status === "MINOR_DEFECT" ? "text-amber" : "text-destructive"}>{maintenanceStatusLabel[status] ?? status}</span>
    </div>
    <div className="mt-1 h-1.5 rounded-full bg-muted"><div className={`h-full rounded-full ${rel >= 70 ? "bg-primary" : rel >= 50 ? "bg-amber" : "bg-destructive"}`} style={{ width: `${rel}%` }} /></div>
    <p className="readout mt-1 text-xs text-muted-foreground">{rel.toFixed(1)}% · A {Number(state.hours_since_a_check ?? 0).toFixed(0)} FH · C {Number(state.hours_since_c_check ?? 0).toFixed(0)} FH · D {Number(state.hours_since_d_check ?? 0).toFixed(0)} FH</p>
    <Button size="sm" variant="outline" className="mt-2 w-full" disabled={!idle} onClick={show}><Wrench className="h-4 w-4" />Maintenance</Button>
    <Dialog open={open} onOpenChange={o => !busy && setOpen(o)}><DialogContent>
      <DialogTitle>Maintenance & MRO</DialogTitle>
      <DialogDescription>Airport level depends on its size; your FBO Maintenance Bay adds one level and a discount. A-Check needs level 2, C-Check 4, D-Check 6. A Fly-in Mechanic repairs defects and AOG anywhere.</DialogDescription>
      {!quotes ? <p className="text-sm text-muted-foreground">Loading quotes…</p> : <div className="divide-y divide-border">
        {quotes.map((q, i) => <div key={q.kind} className="flex items-center justify-between gap-3 py-2 text-sm">
          <div><p>{kinds[i]?.label}</p><p className="readout text-xs text-muted-foreground">{q.available ? (q.fbo_bay ? `FBO bay discount · was ${formatCr(q.base_cost)}` : `Airport level ${q.airport_level}`) : `Needs level ${q.required_level} (here ${q.airport_level})`}</p></div>
          <Button size="sm" disabled={busy || !q.available} onClick={() => run(q.kind)}>{formatCr(q.cost)}</Button>
        </div>)}
      </div>}
    </DialogContent></Dialog>
  </div>;
}

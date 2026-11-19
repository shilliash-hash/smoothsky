import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Eye, EyeOff, RefreshCw, Radio } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { getPilotProfile, regenerateAcarsKey } from "@/lib/pilot.functions";
import { acarsOnline, maskKey } from "@/lib/acars-status";

export function AcarsConnection() {
  const load = useServerFn(getPilotProfile);
  const regen = useServerFn(regenerateAcarsKey);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["pilot-profile"], queryFn: () => load(), refetchInterval: 30_000 });
  const [show, setShow] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  const [now, setNow] = useState(0);
  useEffect(() => { setOrigin(window.location.origin); setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const online = acarsOnline(data?.lastSeen, now);
  const key = data?.acarsKey ?? "";
  const copy = async (text: string) => { await navigator.clipboard.writeText(text); toast.success("Copied to clipboard"); };
  const regenerate = async () => {
    if (!confirm("Regenerate the ACARS key? The current key stops working immediately.")) return;
    setBusy(true);
    try { await regen(); await qc.invalidateQueries({ queryKey: ["pilot-profile"] }); setShow(true); toast.success("New ACARS key issued — the old key is revoked"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Unable to regenerate key"); }
    finally { setBusy(false); }
  };
  const base = `${origin}/api/public/acars`;
  return (
    <div className="instrument p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><Radio className="h-4 w-4" /> ACARS Connection</div>
        <span className={`readout text-xs ${online ? "text-primary" : "text-muted-foreground"}`}>{online ? "● ONLINE" : "○ OFFLINE"}</span>
      </div>
      <div className="mt-3 flex items-center gap-1">
        <code className="readout min-w-0 flex-1 truncate rounded border border-border bg-background/40 px-2 py-1.5 text-xs">{key ? (show ? key : maskKey(key)) : "Loading…"}</code>
        <Button size="icon" variant="ghost" aria-label={show ? "Hide key" : "Show key"} onClick={() => setShow(!show)}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
        <Button size="icon" variant="ghost" aria-label="Copy key" disabled={!key} onClick={() => copy(key)}><Copy className="h-4 w-4" /></Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">{data?.lastSeen ? `Last seen ${new Date(data.lastSeen).toLocaleString("en-US")}` : "Client has never connected"}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={regenerate}><RefreshCw className="mr-1 h-3.5 w-3.5" /> Regenerate key</Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>Client spec</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogTitle>ACARS client specification</DialogTitle>
          <DialogDescription>All endpoints accept POST with JSON and the header <code className="readout">Authorization: Bearer &lt;acars_api_key&gt;</code>. Regenerating the key revokes it instantly.</DialogDescription>
          <div className="space-y-4 text-sm">
            {[
              ["connect", "Returns the active or dispatched flight (flight number, registration, origin, destination).", "{}"],
              ["position", "Live telemetry; overwrites the position on the active flight. The first report takes the dispatched flight airborne. Only one active flight per account is allowed.", JSON.stringify({ lat: 54.377, lon: 18.466, altitude_ft: 12000, ground_speed_kt: 210, heading: 135, fuel_gal: 410, phase: "CRUISE" }, null, 2)],
              ["pirep", "Post-landing report; settles the flight in the ledger and moves the aircraft to the destination.", JSON.stringify({ fuel_used_gal: 96.4, landing_rate_fpm: -142, flight_time_hours: 1.2 }, null, 2)],
            ].map(([name, text, body]) => (
              <div key={name}>
                <div className="flex items-center gap-2"><code className="readout text-primary">POST {base}/{name}</code><Button size="icon" variant="ghost" aria-label={`Copy ${name} URL`} onClick={() => copy(`${base}/${name}`)}><Copy className="h-3.5 w-3.5" /></Button></div>
                <p className="text-xs text-muted-foreground">{text}</p>
                <pre className="readout mt-1 overflow-x-auto rounded border border-border bg-background/40 p-2 text-xs">{body}</pre>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">Phases: PREFLIGHT, TAXI, TAKEOFF, CLIMB, CRUISE, DESCENT, APPROACH, LANDING, TAXI_IN, PARKED. Units: US gal, ft, kt, degrees, fpm. Errors: 401 bad key, 404 no flight, 409 more than one active flight, 400 invalid payload.</p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

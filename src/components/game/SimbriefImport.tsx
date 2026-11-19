import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getPilotProfile, importSimbrief, simbriefUsernameSchema, type SimbriefPlan } from "@/lib/pilot.functions";

export function SimbriefImport({ origin, onImport }: { origin: string; onImport: (plan: SimbriefPlan) => void }) {
  const load = useServerFn(getPilotProfile);
  const fetchPlan = useServerFn(importSimbrief);
  const { data } = useQuery({ queryKey: ["pilot-profile"], queryFn: () => load() });
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState("");
  useEffect(() => { if (data?.simbriefUsername && !username) setUsername(data.simbriefUsername); }, [data?.simbriefUsername]);
  const valid = simbriefUsernameSchema.safeParse(username).success;
  const run = async () => {
    setBusy(true); setInfo("");
    try {
      const plan = await fetchPlan({ data: { username } });
      if (plan.origin !== origin) { toast.error(`OFP departs ${plan.origin || "?"}, but the aircraft is at ${origin}`); setInfo(`Latest OFP: ${plan.origin} → ${plan.destination}. Nothing imported.`); return; }
      onImport(plan);
      setInfo(`Imported ${plan.flightNumber ?? "—"} · ${plan.origin} → ${plan.destination}${plan.passengers != null ? ` · OFP pax ${plan.passengers} (seats are filled from the airport passenger pool)` : ""}`);
      toast.success("SimBrief flight plan imported");
    } catch (e) { toast.error(e instanceof Error ? e.message : "SimBrief import failed"); }
    finally { setBusy(false); }
  };
  return (
    <div className="mb-5 border-b border-border pb-4">
      <label htmlFor="simbrief-user" className="block text-xs uppercase text-muted-foreground">SimBrief username / pilot ID</label>
      <div className="mt-2 flex gap-2">
        <Input id="simbrief-user" className="readout" value={username} maxLength={40} onChange={(e) => setUsername(e.target.value.trim())} placeholder="e.g. 123456" />
        <Button variant="outline" disabled={!valid || busy || !origin} onClick={run}><Download className="mr-1 h-4 w-4" />{busy ? "Importing…" : "Import from SimBrief"}</Button>
      </div>
      {info && <p className="mt-2 text-xs text-muted-foreground">{info}</p>}
    </div>
  );
}

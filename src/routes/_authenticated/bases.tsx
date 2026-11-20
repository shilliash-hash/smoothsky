import { displayTerminology } from "@/lib/display-terminology";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Landmark, Fuel, Wrench, Users, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/game/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { basesQuery } from "@/lib/bases";
import { baseAction } from "@/lib/bases.functions";
import { canOpenBase, canInvest } from "@/lib/bases-rules";
import { companyQuery, economyQuery } from "@/lib/game";
import { useAirportSearch, MIN_SEARCH_CHARS } from "@/lib/airport-search";
import { RouteError } from "@/components/game/RouteError";
import { formatCr } from "@/lib/rules";
import { useVisibleTiers } from "@/lib/airport-tiers";
import { TierPills } from "@/components/game/TierPills";

export const Route = createFileRoute("/_authenticated/bases")({
  loader: async ({ context }) => { const company = await context.queryClient.ensureQueryData(companyQuery); if (!company) throw redirect({ to: "/onboarding" }); await Promise.all([context.queryClient.ensureQueryData(basesQuery), context.queryClient.ensureQueryData(economyQuery)]); },
  errorComponent: RouteError,
  head: () => ({ meta: [{ title: "Company bases — SmoothSky" }, { name: "description", content: "Manage your main and satellite SmoothSky bases, operating modules and weekly costs." }, { property: "og:title", content: "Company bases — SmoothSky" }, { property: "og:description", content: "Company FBO infrastructure, fuel contracts and operating discounts." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Bases,
});
const modules = [ { key: "fuel", flag: "has_fuel_contract", label: "Fuel Contract", icon: Fuel }, { key: "handling", flag: "has_handling_desk", label: "Handling Desk", icon: Users }, { key: "maintenance", flag: "has_maintenance_bay", label: "Maintenance Bay", icon: Wrench } ] as const;
function Bases() {
  const { data: company } = useSuspenseQuery(companyQuery);
  const { data } = useSuspenseQuery(basesQuery);
  const { data: rules } = useSuspenseQuery(economyQuery);
  const action = useServerFn(baseAction);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [airport, setAirport] = useState(company?.home_base_icao ?? "");
  const [type, setType] = useState<"MAIN" | "SATELLITE">(data.bases.some(b => b.base_type === "MAIN") ? "SATELLITE" : "MAIN");
  const [confirmation, setConfirmation] = useState<Parameters<typeof action>[0]["data"] | null>(null);
  const invest = data.health ? canInvest(data.health.status) : false;
  const number = (key: string) => Number(rules[key] ?? 0);
  const [tiers, setTiers] = useVisibleTiers();
  const found = useAirportSearch(filter, tiers);
  const matches = (filter.trim().length >= MIN_SEARCH_CHARS ? found.data ?? [] : []).filter(a => !data.bases.some(b => b.airport_icao === a.icao)).slice(0, 50);
  async function execute() {
    if (!confirmation) return;
    setBusy(true);
    try { await action({ data: confirmation }); if (confirmation.action === "open") { setType("SATELLITE"); setAirport(""); setFilter(""); } setConfirmation(null); await qc.invalidateQueries(); toast.success("Base investment recorded"); } catch (e) { toast.error(e instanceof Error ? displayTerminology(e.message) : "Investment failed"); } finally { setBusy(false); }
  }
  return <AppShell company={company}>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="readout text-xs uppercase text-amber">Infrastructure · Company network</p><h1 className="mt-1 text-3xl font-semibold">Company bases</h1></div><span className="readout text-sm text-muted-foreground">{data.bases.filter(b => b.base_type === "MAIN").length} / 1 Main · {data.bases.filter(b => b.base_type === "SATELLITE").length} / 2 Satellite</span></div>
    <div className="mt-5 flex flex-wrap gap-6 border-y border-border py-4 readout text-sm"><span>Cash {formatCr(data.health?.balance ?? 0)}</span><span>Weekly obligations {formatCr(data.health?.weekly_obligations ?? 0)}</span></div>
    {!invest && <p role="alert" className="mt-4 text-destructive">Outstanding obligations · New investments suspended</p>}
    <section className="mt-7 grid gap-5 lg:grid-cols-3">
      {data.bases.map(b => { const weekly = number(`fob_${b.base_type.toLowerCase()}_upkeep`) + modules.reduce((sum, m) => sum + (b[m.flag] ? number(`fob_${m.key}_upkeep`) : 0), 0); return <article key={b.id} className="border border-border rounded-md p-5">
        <div className="flex items-center gap-3"><Landmark className="h-6 w-6 text-amber" /><div><p className="text-xs uppercase text-muted-foreground">{b.base_type} FBO</p><h2 className="readout text-xl text-primary">{b.airport_icao}</h2></div></div><p className="mt-2 min-h-10 text-sm text-muted-foreground">{b.airport?.name}</p>
        <div className="mt-4 space-y-4">{modules.map(m => <div key={m.key} className="border-t border-border pt-3"><div className="flex items-center justify-between gap-2"><span className="flex items-center gap-2 text-sm"><m.icon className="h-4 w-4" />{m.label}</span>{b[m.flag] ? <Check aria-label="Installed" className="h-4 w-4 text-success" /> : <Button size="sm" variant="outline" disabled={busy || !invest || (data.health?.balance ?? 0) < number(`fob_${m.key}_setup`)} onClick={() => setConfirmation({ action: "module", base: b.id, module: m.key })}><Plus className="h-3 w-3" />Install</Button>}</div><p className="mt-1 text-xs text-muted-foreground">{(number(`fob_${m.key}_discount`) * 100).toFixed(0)}% discount · {formatCr(number(`fob_${m.key}_upkeep`))}/week{!b[m.flag] && ` · ${formatCr(number(`fob_${m.key}_setup`))} setup`}</p></div>)}</div>
        <p className="readout mt-5 border-t border-border pt-3 text-sm">{formatCr(weekly)} / week</p><p className="mt-1 text-xs text-muted-foreground">Next payment · {new Date(b.next_payment_due).toLocaleDateString("en-US")}</p>
      </article>; })}
    </section>
    <section className="mt-8 border-y border-border py-5"><h2 className="text-lg font-semibold">Open an FBO</h2><div className="mt-4 grid items-end gap-4 sm:grid-cols-2"><label className="text-sm">Base type<Select value={type} onValueChange={v => setType(v === "MAIN" ? "MAIN" : "SATELLITE")}><SelectTrigger aria-label="Base type" className="mt-2"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="MAIN">Main FBO</SelectItem><SelectItem value="SATELLITE">Satellite FBO</SelectItem></SelectContent></Select></label><label className="text-sm">Airport search<Input aria-label="Search base airports" className="mt-2" placeholder="Type 2+ letters: ICAO, airport or city" value={filter} onChange={e => setFilter(e.target.value)} /></label></div>
      <div className="mt-4"><TierPills tiers={tiers} onChange={setTiers} /></div><div className="mt-3 max-h-56 overflow-y-auto divide-y divide-border">{matches.map(a => <Button key={a.icao} variant="ghost" aria-pressed={airport === a.icao} className={`h-auto w-full justify-start gap-3 rounded-none py-3 whitespace-normal text-left ${airport === a.icao ? "bg-accent" : ""}`} onClick={() => setAirport(a.icao)}><span className="readout text-primary">{a.icao}</span><span className="text-xs text-muted-foreground">{a.name}</span></Button>)}</div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4"><p className="readout text-sm">{airport || "Select airport"} · Setup {formatCr(number(`fob_${type.toLowerCase()}_setup`))} · {formatCr(number(`fob_${type.toLowerCase()}_upkeep`))}/week</p><Button disabled={busy || !invest || !airport || data.bases.some(b => b.airport_icao === airport) || !canOpenBase(type, data.bases) || (data.health?.balance ?? 0) < number(`fob_${type.toLowerCase()}_setup`)} onClick={() => setConfirmation({ action: "open", airport, type })}><Landmark className="h-4 w-4" />Open {type === "MAIN" ? "Main" : "Satellite"} FBO</Button></div>
    </section>
    <Dialog open={Boolean(confirmation)} onOpenChange={open => { if (!open && !busy) setConfirmation(null); }}><DialogContent><DialogTitle>Confirm base investment</DialogTitle><DialogDescription>{confirmation?.action === "open" ? `Open ${confirmation.type} FBO at ${confirmation.airport} for ${formatCr(number(`fob_${confirmation.type.toLowerCase()}_setup`))}. Weekly upkeep starts in seven days.` : confirmation?.action === "module" ? `Install ${confirmation.module} for ${formatCr(number(`fob_${confirmation.module}_setup`))}. Weekly upkeep increases by ${formatCr(number(`fob_${confirmation.module}_upkeep`))}.` : ""} Setup payments are non-refundable.</DialogDescription><div className="flex justify-end gap-3"><Button variant="outline" disabled={busy} onClick={() => setConfirmation(null)}>Cancel</Button><Button disabled={busy} onClick={execute}>Confirm investment</Button></div></DialogContent></Dialog>
  </AppShell>;
}
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPilotLeaderboard } from "@/lib/pilot.functions";
import { Trophy } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/game/AppShell";
import { SupporterBadge } from "@/components/game/SupporterBadge";
import { CompanyDossier } from "@/components/game/CompanyDossier";
import { Input } from "@/components/ui/input";
import { leaderboardQuery } from "@/lib/leaderboard";
import { rankMovement } from "@/lib/leaderboard-rules";
import { companyQuery } from "@/lib/game";
import { formatCr } from "@/lib/rules";

export const Route = createFileRoute("/_authenticated/leaderboard")({
  loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(leaderboardQuery), context.queryClient.ensureQueryData(companyQuery)]); },
  head: () => ({ meta: [
    { title: "Company leaderboard — SmoothSky" },
    { name: "description", content: "SmoothSky company rankings by net worth, completed flights, flight hours and passengers." },
    { property: "og:title", content: "Company leaderboard — SmoothSky" },
    { property: "og:description", content: "Compare SmoothSky airlines and celebrate community supporters." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Leaderboard,
});
function Leaderboard() {
  const { data: rows } = useSuspenseQuery(leaderboardQuery);
  const { data: company } = useSuspenseQuery(companyQuery);
  const [search, setSearch] = useState("");
  const [dossier, setDossier] = useState<string | null>(null);
  const [tab, setTab] = useState<"airlines" | "pilots">("airlines");
  const pilotsFn = useServerFn(getPilotLeaderboard);
  const { data: pilots = [] } = useQuery({ queryKey: ["pilot-leaderboard"], queryFn: () => pilotsFn(), enabled: tab === "pilots" });
  const filtered = rows.filter(row => `${row.company_name} ${row.icao_code} ${row.home_base_icao}`.toLowerCase().includes(search.toLowerCase()));
  return <AppShell company={company}>
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><p className="readout flex items-center gap-2 text-xs uppercase text-amber"><Trophy className="h-4 w-4" />World airlines · {rows.length} companies</p><h1 className="mt-2 text-3xl font-semibold">Leaderboard</h1></div>
      <Input aria-label="Search leaderboard" placeholder="Company, ICAO or home base" value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:max-w-xs" />
    </div>
    <div className="mt-5 flex gap-2" role="tablist">
      {(["airlines", "pilots"] as const).map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`readout rounded-sm border px-3 py-1 text-xs uppercase ${tab === t ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>{t === "airlines" ? "Airlines · net worth" : "Pilots · hours"}</button>)}
    </div>
    {tab === "pilots" ? <div className="mt-4 overflow-x-auto border-y border-border">
      <table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-panel text-muted-foreground"><tr><th className="p-3">Rank</th><th className="p-3">Pilot</th><th className="p-3 text-right">Hours</th><th className="p-3 text-right">Flights</th><th className="p-3 text-right">Earned</th></tr></thead>
      <tbody>{pilots.filter(p => p.pilot_name.toLowerCase().includes(search.toLowerCase())).map((p, i) => <tr key={i} className={`border-t border-border ${p.is_me ? "bg-primary/5" : ""}`}>
        <td className="readout p-3 text-lg">{i + 1}</td>
        <td className="p-3"><div className="font-semibold">{p.pilot_name}</div><div className="text-xs text-muted-foreground">{p.career_role === "PILOT_ONLY" ? "Pilot" : "Airline owner"}{p.is_me ? " · You" : ""}</div></td>
        <td className="readout p-3 text-right">{Number(p.flight_hours).toFixed(1)}</td><td className="readout p-3 text-right">{Number(p.flight_count)}</td><td className="readout p-3 text-right">{formatCr(Number(p.earned))}</td>
      </tr>)}</tbody></table>
      {pilots.length === 0 && <p className="py-10 text-center text-muted-foreground">No pilots yet.</p>}
    </div> : <>
    <div className="mt-4 overflow-x-auto border-y border-border">
      <table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-panel text-muted-foreground"><tr><th className="p-3">Rank</th><th className="p-3">Company</th><th className="p-3">Home base</th><th className="p-3 text-right">Net worth</th><th className="p-3 text-right">Flights</th><th className="p-3 text-right">Hours</th><th className="p-3 text-right">Passengers</th></tr></thead>
      <tbody>{filtered.map(row => { const movement = rankMovement(Number(row.rank), row.prev_week_rank); return <tr key={row.icao_code} tabIndex={0} title="Open public dossier" onClick={() => setDossier(row.icao_code)} onKeyDown={e => { if (e.key === "Enter") setDossier(row.icao_code); }} className={`cursor-pointer border-t border-border transition-colors hover:bg-primary/10 ${row.icao_code === company?.icao_code ? "bg-primary/5" : ""}`}>
        <td className="p-3"><span className="readout text-lg">{row.rank}</span><span className={`readout mt-1 block whitespace-nowrap text-xs ${movement.tone}`} title="Change since last week's recorded ranking">{movement.label}</span></td>
        <td className="p-3"><div className="font-semibold">{row.company_name}</div><div className="mt-1 flex flex-wrap items-center gap-2"><span className="readout text-xs text-primary">{row.icao_code}</span>{row.is_supporter && <SupporterBadge />}{row.icao_code === company?.icao_code && <span className="text-xs text-muted-foreground">Your company</span>}</div></td>
        <td className="max-w-52 p-3"><span className="readout">{row.home_base_icao}</span><div className="mt-1 text-xs text-muted-foreground">{row.home_base_name}</div></td>
        <td className="readout whitespace-nowrap p-3 text-right">{formatCr(Number(row.net_worth))}</td><td className="readout p-3 text-right">{Number(row.flight_count).toLocaleString("en-US")}</td><td className="readout p-3 text-right">{Number(row.flight_hours).toFixed(1)}</td><td className="readout p-3 text-right">{Number(row.passengers).toLocaleString("en-US")}</td>
      </tr>; })}</tbody></table>
      {filtered.length === 0 && <p className="py-10 text-center text-muted-foreground">{rows.length ? "No matching companies." : "No companies yet."}</p>}
    </div>
    </>}
    <CompanyDossier icao={dossier} open={!!dossier} onOpenChange={o => { if (!o) setDossier(null); }} />
    <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted-foreground">Net worth = ledger cash + owned aircraft purchase value + active lease deposits + invested value of active FBOs and modules. Flight totals include completed flights; test hours use simulated flight time, not accelerated wall-clock time. Weekly positions are recorded on the first ranking visit of each UTC week.</p>
  </AppShell>;
}
import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/game/AppShell";
import { SupporterBadge } from "@/components/game/SupporterBadge";
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
  const filtered = rows.filter(row => `${row.company_name} ${row.icao_code} ${row.home_base_icao}`.toLowerCase().includes(search.toLowerCase()));
  return <AppShell company={company}>
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div><p className="readout flex items-center gap-2 text-xs uppercase text-amber"><Trophy className="h-4 w-4" />World airlines · {rows.length} companies</p><h1 className="mt-2 text-3xl font-semibold">Leaderboard</h1></div>
      <Input aria-label="Search leaderboard" placeholder="Company, ICAO or home base" value={search} onChange={e => setSearch(e.target.value)} className="w-full sm:max-w-xs" />
    </div>
    <div className="mt-6 overflow-x-auto border-y border-border">
      <table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-panel text-muted-foreground"><tr><th className="p-3">Rank</th><th className="p-3">Company</th><th className="p-3">Home base</th><th className="p-3 text-right">Net worth</th><th className="p-3 text-right">Flights</th><th className="p-3 text-right">Hours</th><th className="p-3 text-right">Passengers</th></tr></thead>
      <tbody>{filtered.map(row => { const movement = rankMovement(Number(row.rank), row.prev_week_rank); return <tr key={row.icao_code} className={`border-t border-border ${row.icao_code === company?.icao_code ? "bg-primary/5" : ""}`}>
        <td className="p-3"><span className="readout text-lg">{row.rank}</span><span className={`readout mt-1 block whitespace-nowrap text-xs ${movement.tone}`} title="Change since last week's recorded ranking">{movement.label}</span></td>
        <td className="p-3"><div className="font-semibold">{row.company_name}</div><div className="mt-1 flex flex-wrap items-center gap-2"><span className="readout text-xs text-primary">{row.icao_code}</span>{row.is_supporter && <SupporterBadge />}{row.icao_code === company?.icao_code && <span className="text-xs text-muted-foreground">Your company</span>}</div></td>
        <td className="max-w-52 p-3"><span className="readout">{row.home_base_icao}</span><div className="mt-1 text-xs text-muted-foreground">{row.home_base_name}</div></td>
        <td className="readout whitespace-nowrap p-3 text-right">{formatCr(Number(row.net_worth))}</td><td className="readout p-3 text-right">{Number(row.flight_count).toLocaleString("en-US")}</td><td className="readout p-3 text-right">{Number(row.flight_hours).toFixed(1)}</td><td className="readout p-3 text-right">{Number(row.passengers).toLocaleString("en-US")}</td>
      </tr>; })}</tbody></table>
      {filtered.length === 0 && <p className="py-10 text-center text-muted-foreground">{rows.length ? "No matching companies." : "No companies yet."}</p>}
    </div>
    <p className="mt-4 max-w-3xl text-xs leading-relaxed text-muted-foreground">Net worth = ledger cash + owned aircraft purchase value + active lease deposits + invested value of active FOBs and modules. Flight totals include completed flights; test hours use simulated flight time, not accelerated wall-clock time. Weekly positions are recorded on the first ranking visit of each UTC week.</p>
  </AppShell>;
}
import { createFileRoute, redirect, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BookOpen } from "lucide-react";
import { AppShell } from "@/components/game/AppShell";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { companyQuery } from "@/lib/game";
import { logbookQuery, logbookResult } from "@/lib/logbook";
import { formatCr } from "@/lib/rules";
import { FlightDebrief } from "@/components/game/FlightDebrief";

export const Route = createFileRoute("/_authenticated/logbook")({
  loader: async ({ context }) => {
    const company = await context.queryClient.ensureQueryData(companyQuery);
    if (!company) throw redirect({ to: "/onboarding" });
    await context.queryClient.ensureQueryData(logbookQuery(company.id));
    return { companyId: company.id };
  },
  head: () => ({ meta: [
    { title: "Flight Logbook — SmoothSky" },
    { name: "description", content: "Your company's completed flights, aircraft, routes, flight hours, passengers and settled net results." },
    { property: "og:title", content: "Flight Logbook — SmoothSky" },
    { property: "og:description", content: "Review completed SmoothSky flights and their settled financial results by aircraft." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Logbook,
  errorComponent: LogbookError,
});

function LogbookError({ reset }: ErrorComponentProps) {
  const router = useRouter();
  const qc = router.options.context.queryClient;
  const company = qc.getQueryData(companyQuery.queryKey);
  const [retrying, setRetrying] = useState(false);
  return <AppShell company={company ?? null}>
    <h1 className="text-3xl font-semibold">Flight Logbook</h1>
    <div role="alert" className="mt-6 border-y border-border py-8">
      <p className="font-semibold">Unable to load flights</p>
      <p className="mt-2 text-sm text-muted-foreground">Check your connection and try again. Your flight records have not been changed.</p>
      <Button className="mt-4" disabled={retrying} onClick={async () => {
        setRetrying(true);
        try {
          await qc.resetQueries({ queryKey: ["flight-logbook"] });
          await router.invalidate();
          reset();
        } finally { setRetrying(false); }
      }}>{retrying ? "Retrying…" : "Try again"}</Button>
    </div>
  </AppShell>;
}

function Logbook() {
  const { companyId } = Route.useLoaderData();
  const { data: company } = useSuspenseQuery(companyQuery);
  const { data: flights } = useSuspenseQuery(logbookQuery(companyId));
  const [aircraftId, setAircraftId] = useState("all");
  const aircraft = [...new Map(flights.map(f => [f.aircraft_id, { id: f.aircraft_id, registration: f.aircraft?.registration ?? "—", model: f.aircraft?.type?.model ?? "" }])).values()]
    .sort((a, b) => a.registration.localeCompare(b.registration));
  const filtered = flights.filter(f => aircraftId === "all" || f.aircraft_id === aircraftId);

  return <AppShell company={company}>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="readout flex items-center gap-2 text-xs uppercase text-amber"><BookOpen className="h-4 w-4" />{company?.icao_code} · {filtered.length.toLocaleString("en-US")} completed flights</p>
        <h1 className="mt-2 text-3xl font-semibold">Flight Logbook</h1>
      </div>
      <Select value={aircraftId} onValueChange={setAircraftId}>
        <SelectTrigger aria-label="Filter logbook by aircraft" className="w-full sm:w-72"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All aircraft</SelectItem>
          {aircraft.map(a => <SelectItem key={a.id} value={a.id}>{a.registration} · {a.model}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    <div className="mt-6 overflow-x-auto border-y border-border">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead className="bg-panel text-xs uppercase text-muted-foreground"><tr>
          <th className="p-3">Landing (UTC)</th><th className="p-3">Flight</th><th className="p-3">Aircraft</th><th className="p-3">Route</th><th className="p-3 text-right">Hours</th><th className="p-3 text-right">PAX</th><th className="p-3 text-right">Net (SC)</th><th className="p-3">Debrief</th>
        </tr></thead>
        <tbody>{filtered.map(f => {
          const result = logbookResult(f);
          return <tr key={f.id} className="border-t border-border">
            <td className="readout whitespace-nowrap p-3 text-muted-foreground">{f.completed_at ? new Date(f.completed_at).toLocaleString("en-GB", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—"}</td>
            <td className="readout p-3 text-amber">{f.flight_number ?? "—"}</td>
            <td className="p-3"><span className="readout">{f.aircraft?.registration ?? "—"}</span><div className="mt-1 text-xs text-muted-foreground">{f.aircraft?.type?.manufacturer} {f.aircraft?.type?.model}</div></td>
            <td className="p-3"><span className="readout whitespace-nowrap">{f.origin_icao} → {f.destination_icao}</span><div className="readout mt-1 text-xs text-muted-foreground">{Number(f.distance_nm).toFixed(1)} NM</div></td>
            <td className="readout p-3 text-right">{result.hours.toFixed(2)}</td>
            <td className="readout p-3 text-right">{f.passengers}</td>
            <td className={`readout whitespace-nowrap p-3 text-right ${result.net === null ? "text-muted-foreground" : result.net >= 0 ? "text-success" : "text-destructive"}`}>{result.net === null ? "—" : `${result.net > 0 ? "+" : ""}${formatCr(result.net)}`}</td>
            <td className="p-3"><FlightDebrief flightNumber={f.flight_number} route={`${f.origin_icao} → ${f.destination_icao}`} settlement={f.settlement} /></td>
          </tr>;
        })}</tbody>
      </table>
      {filtered.length === 0 && <p className="py-10 text-center text-muted-foreground">{flights.length ? "No completed flights for this aircraft." : "No completed flights yet."}</p>}
    </div>
  </AppShell>;
}
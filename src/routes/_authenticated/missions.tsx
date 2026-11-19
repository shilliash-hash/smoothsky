import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { HeartPulse, Wrench, Timer, Plane } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/game/AppShell";
import { Button } from "@/components/ui/button";
import { companyQuery } from "@/lib/game";
import { fleetOverviewQuery } from "@/lib/fleet";
import { missionsQuery, missionPayout, type Mission } from "@/lib/missions";
import { acceptMission } from "@/lib/missions.functions";
import { flightAction } from "@/lib/operations.functions";
import type { Quote } from "@/lib/operations";
import { formatCr } from "@/lib/rules";

export const Route = createFileRoute("/_authenticated/missions")({
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(missionsQuery),
      context.queryClient.ensureQueryData(companyQuery),
      context.queryClient.ensureQueryData(fleetOverviewQuery),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Special Missions — SmoothSky" },
      { name: "description", content: "Urgent MEDEVAC and AOG contracts with fixed payouts and tight deadlines." },
      { property: "og:title", content: "Special Missions — SmoothSky" },
      { property: "og:description", content: "Accept time-critical MEDEVAC and AOG freight missions across the SmoothSky network." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Missions,
});

function countdown(to: string | null, now: number) {
  if (!to) return "—";
  const ms = new Date(to).getTime() - now;
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3600000);
  const m = Math.floor((abs % 3600000) / 60000);
  return `${ms < 0 ? "−" : ""}${h}h ${String(m).padStart(2, "0")}m`;
}

function Missions() {
  const { data } = useSuspenseQuery(missionsQuery);
  const { data: company } = useSuspenseQuery(companyQuery);
  const [now, setNow] = useState(data.serverTime);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const mine = data.missions.filter((m) => m.accepted_by === data.userId);
  const active = mine.filter((m) => m.status === "ACCEPTED");
  const open = data.missions.filter((m) => m.status === "OPEN");
  return (
    <AppShell company={company ?? null}>
      <p className="readout text-xs uppercase text-amber">Urgent contracts · Fixed payout</p>
      <h1 className="mt-1 text-3xl font-semibold">Special Missions</h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        MEDEVAC flights carry 150–300 kg with airport fees waived and a 2–3 h deadline. AOG freight needs at least 1,500 kg capacity and a 4 h deadline. The clock starts when you accept; late delivery halves the payout.
      </p>
      {active.map((m) => <ActiveMission key={m.id} mission={m} now={now} hasCompany={!!company} />)}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Mission board · {open.length} open</h2>
        <div className="mt-3 divide-y divide-border border-y border-border">
          {open.map((m) => <MissionRow key={m.id} mission={m} now={now} canAccept={active.length === 0} />)}
          {open.length === 0 && <p className="py-8 text-muted-foreground">No open missions right now.</p>}
        </div>
      </section>
      {mine.some((m) => m.status === "COMPLETED") && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Completed</h2>
          <div className="mt-3 divide-y divide-border border-y border-border">
            {mine.filter((m) => m.status === "COMPLETED").map((m) => (
              <div key={m.id} className="flex flex-wrap justify-between gap-3 py-3 text-sm">
                <span className="readout">{m.category} · {m.origin_icao} → {m.destination_icao}</span>
                <span className={m.delivered_late ? "text-destructive" : "text-primary"}>{formatCr(Number(m.final_payout ?? 0))}{m.delivered_late ? " · late −50%" : ""}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}

function Icon({ category }: { category: string }) {
  return category === "MEDEVAC" ? <HeartPulse className="h-5 w-5 text-destructive" /> : <Wrench className="h-5 w-5 text-amber" />;
}

function MissionRow({ mission: m, now, canAccept }: { mission: Mission; now: number; canAccept: boolean }) {
  const accept = useServerFn(acceptMission);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-4">
      <div className="flex items-start gap-3">
        <Icon category={m.category} />
        <div>
          <p className="readout text-primary">{m.category === "MEDEVAC" ? "MEDEVAC / Transplant" : "AOG / Industrial freight"} · {m.origin_icao} → {m.destination_icao}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {Math.round(Number(m.distance_nm))} NM · {m.cargo_kg} kg · deadline {Number(m.deadline_hours)} h after acceptance{m.category === "MEDEVAC" ? " · airport fees 0 SC" : ""} · board expires in {countdown(m.expires_at, now)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <span className="readout text-lg text-amber">{formatCr(Number(m.payout))}</span>
        <Button size="sm" disabled={busy || !canAccept} title={canAccept ? undefined : "Complete your current mission first"} onClick={async () => {
          setBusy(true);
          try { await accept({ data: { mission: m.id } }); await qc.invalidateQueries({ queryKey: ["missions"] }); toast.success("Mission accepted — the clock is running"); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Unable to accept mission"); }
          finally { setBusy(false); }
        }}>Accept</Button>
      </div>
    </div>
  );
}

function ActiveMission({ mission: m, now, hasCompany }: { mission: Mission; now: number; hasCompany: boolean }) {
  const { data: overview } = useSuspenseQuery(fleetOverviewQuery);
  const action = useServerFn(flightAction);
  const qc = useQueryClient();
  const bonus = Number(overview.rules.all_cargo_capacity_bonus ?? 0.5);
  const candidates = useMemo(
    () => overview.fleet.filter((f) => !f.returned_at && f.status === "AVAILABLE" && f.location_icao === m.origin_icao && (f.type?.cargo_kg ?? 0) * (1 + bonus) >= m.cargo_kg),
    [overview.fleet, m, bonus],
  );
  const [aircraft, setAircraft] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pay = missionPayout(Number(m.payout), m.deadline_at, now);
  useEffect(() => {
    setQuote(null); setError("");
    if (!aircraft) return;
    let live = true;
    action({ data: { action: "quote", aircraft, destination: m.destination_icao, mission: m.id } })
      .then((q) => live && setQuote(q as Quote)).catch((e) => live && setError(e.message));
    return () => { live = false; };
  }, [aircraft, m.id, m.destination_icao, action]);
  return (
    <section className="instrument mt-6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Icon category={m.category} />
          <div>
            <p className="readout text-xs uppercase text-amber">Accepted mission</p>
            <h2 className="mt-1 text-xl font-semibold">{m.origin_icao} → {m.destination_icao} · {m.cargo_kg} kg</h2>
            <p className="mt-1 text-sm text-muted-foreground">{m.flight_id ? "Flight dispatched — complete it from Dispatch to collect the payout." : "Dispatch an aircraft parked at " + m.origin_icao + "."}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`readout flex items-center justify-end gap-1 text-lg ${pay.late ? "text-destructive" : "text-primary"}`}><Timer className="h-4 w-4" />{countdown(m.deadline_at, now)}</p>
          <p className="readout text-sm">{formatCr(pay.amount)}{pay.late ? " · late −50%" : ""}</p>
        </div>
      </div>
      {!m.flight_id && (hasCompany ? (
        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <label className="text-xs uppercase text-muted-foreground">Aircraft at {m.origin_icao}
            <select className="mt-2 block w-full rounded-sm border border-input bg-panel p-3 text-sm normal-case text-foreground" value={aircraft} onChange={(e) => setAircraft(e.target.value)}>
              <option value="">{candidates.length ? "Select aircraft" : "No suitable aircraft at origin"}</option>
              {candidates.map((f) => <option key={f.id} value={f.id}>{f.registration} · {f.type?.model} · {Math.floor((f.type?.cargo_kg ?? 0) * (1 + bonus))} kg All-Cargo</option>)}
            </select>
          </label>
          <Button disabled={busy || !quote} onClick={async () => {
            setBusy(true);
            try { await action({ data: { action: "dispatch", aircraft, destination: m.destination_icao, mission: m.id } }); await qc.invalidateQueries(); toast.success("Mission flight dispatched"); }
            catch (e) { toast.error(e instanceof Error ? e.message : "Dispatch failed"); }
            finally { setBusy(false); }
          }}><Plane className="h-4 w-4" />Dispatch mission</Button>
          {error && <p role="alert" className="text-sm text-destructive md:col-span-2">{error}</p>}
          {quote && <p className="readout text-xs text-muted-foreground md:col-span-2">Payout {formatCr(quote.revenue)} · fuel {formatCr(-quote.fuel_cost)} · fees {formatCr(-(quote.landing_fee + quote.handling_fee))} · maintenance {formatCr(-quote.maintenance)} · net {formatCr(quote.net)}</p>}
        </div>
      ) : <p className="mt-4 text-sm text-muted-foreground">Missions are flown on airline aircraft. <Link to="/onboarding" className="text-primary underline">Found an airline</Link> to dispatch it.</p>)}
      {m.flight_id && <Button asChild variant="outline" className="mt-4"><Link to="/dispatch">Open Dispatch</Link></Button>}
    </section>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { HeartPulse, Wrench, Crown, Users, Timer, Plane, Undo2, MapPin, CheckCircle2, Map, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/game/AppShell";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { InfoHint } from "@/components/game/InfoHint";
import { FlightBriefing } from "@/components/game/FlightBriefing";
import { MissionPreview } from "@/components/game/MissionPreview";
import type { PreviewAircraft } from "@/lib/mission-preview";
import { companyQuery } from "@/lib/game";
import { fleetOverviewQuery } from "@/lib/fleet";
import { missionsQuery, missionPayout, missionFleetFit, charterFleetFit, charterKind, missionPax, type Mission, type MissionTab } from "@/lib/missions";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { acceptMission, cancelMission } from "@/lib/missions.functions";
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
      { name: "description", content: "Urgent MEDEVAC, AOG and VIP/Group charter contracts with fixed payouts and tight deadlines." },
      { property: "og:title", content: "Special Missions — SmoothSky" },
      { property: "og:description", content: "Accept time-critical MEDEVAC, AOG freight and exclusive charter missions across the SmoothSky network." },
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
  const { data: overview } = useSuspenseQuery(fleetOverviewQuery);
  const bonus = Number(overview.rules.all_cargo_capacity_bonus ?? 0.5);
  const airlineFleet = useMemo(() => (company ? overview.fleet.filter((f) => f.company_id === company.id) : []), [overview.fleet, company]);
  const [now, setNow] = useState(data.serverTime);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  const mine = data.missions.filter((m) => m.accepted_by === data.userId);
  const active = mine.filter((m) => m.status === "ACCEPTED");
  const open = data.missions.filter((m) => m.status === "OPEN");
  const [tab, setTab] = useState<MissionTab>("ALL");
  const [readyOnly, setReadyOnly] = useState(false);
  const fitOf = (m: Mission) => m.category === "CHARTER"
    ? charterFleetFit(airlineFleet, missionPax(m), m.cargo_kg, m.origin_icao)
    : missionFleetFit(airlineFleet, m.cargo_kg, m.origin_icao, bonus);
  const count = (c: MissionTab) => (c === "ALL" ? open.length : open.filter((m) => m.category === c).length);
  const shown = open.filter((m) => (tab === "ALL" || m.category === tab) && (!readyOnly || fitOf(m).atOrigin));
  return (
    <AppShell company={company ?? null}>
      <p className="readout text-xs uppercase text-amber">Urgent contracts · Fixed payout</p>
      <h1 className="mt-1 flex items-center gap-2 text-3xl font-semibold">Special Missions
        <InfoHint label="Mission rules">
          <p><span className="text-foreground">Aircraft on site:</span> you can accept a mission only with an available airline aircraft already parked at its departure airport that fits the cargo (All-Cargo capacity +{Math.round(bonus * 100)}% counted).</p>
          <p><span className="text-foreground">First come, first served:</span> fly an empty repositioning leg to the origin before the offer leaves the board — if another airline accepts it first, the contract is gone.</p>
          <p><span className="text-foreground">Abandon:</span> you can give up an accepted mission any time before its flight is dispatched — no penalty, it simply returns to the shared board.</p>
          <p><span className="text-foreground">Auto-release:</span> if no aircraft is dispatched before the deadline, the contract goes back to the board automatically.</p>
          <p><span className="text-foreground">Charters:</span> VIP (6–14 PAX) and Group (45–150 PAX) charters book the whole aircraft — only the charter party and their baggage fly, no scheduled passengers or freight. The fixed payout is not reduced by corridor saturation.</p>
          <p><span className="text-foreground">Late delivery:</span> once the flight is under way the contract stays yours; landing after the deadline pays 50%.</p>
        </InfoHint>
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        MEDEVAC flights carry 150–300 kg with airport fees waived and a 2–3 h deadline. AOG freight needs at least 1,500 kg capacity and a 4 h deadline. VIP and Group charters need enough seats for the whole party plus baggage space. To accept, an aircraft must already be parked at the origin; the clock starts when you accept and late delivery halves the payout.
      </p>
      {active.map((m) => <ActiveMission key={m.id} mission={m} now={now} companyId={company?.id ?? null} />)}
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Mission board · {open.length} open</h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <Tabs value={tab} onValueChange={(v) => setTab(v as MissionTab)}>
            <TabsList>
              <TabsTrigger value="ALL">All ({count("ALL")})</TabsTrigger>
              <TabsTrigger value="CHARTER">VIP & Group Charters ({count("CHARTER")})</TabsTrigger>
              <TabsTrigger value="AOG">AOG Cargo ({count("AOG")})</TabsTrigger>
              <TabsTrigger value="MEDEVAC">MEDEVAC ({count("MEDEVAC")})</TabsTrigger>
            </TabsList>
          </Tabs>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={readyOnly} onCheckedChange={setReadyOnly} />Ready at my airports
          </label>
        </div>
        <div className="mt-3 divide-y divide-border border-y border-border">
          {shown.map((m) => <MissionRow key={m.id} mission={m} now={now} canAccept={active.length === 0} fit={fitOf(m)} fleet={airlineFleet} bonus={bonus} />)}
          {shown.length === 0 && <p className="py-8 text-muted-foreground">{open.length === 0 ? "No open missions right now." : "No missions match this filter."}</p>}
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

function Icon({ category, pax = 0 }: { category: string; pax?: number }) {
  if (category === "CHARTER") return charterKind(pax) === "VIP" ? <Crown className="h-5 w-5 text-amber" /> : <Users className="h-5 w-5 text-primary" />;
  return category === "MEDEVAC" ? <HeartPulse className="h-5 w-5 text-destructive" /> : <Wrench className="h-5 w-5 text-amber" />;
}

function missionTitle(m: Mission) {
  if (m.category === "CHARTER") return charterKind(missionPax(m)) === "VIP" ? "VIP / Executive charter" : "Group / Event charter";
  return m.category === "MEDEVAC" ? "MEDEVAC / Transplant" : "AOG / Industrial freight";
}

type Fit = ReturnType<typeof missionFleetFit> | ReturnType<typeof charterFleetFit>;

function MissionRow({ mission: m, now, canAccept, fit, fleet, bonus }: { mission: Mission; now: number; canAccept: boolean; fit: Fit; fleet: PreviewAircraft[]; bonus: number }) {
  const charter = m.category === "CHARTER";
  const pax = missionPax(m);
  const accept = useServerFn(acceptMission);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-4">
      <div className="flex items-start gap-3">
        <Icon category={m.category} pax={pax} />
        <div>
          <p className="readout text-primary">{missionTitle(m)} · {m.origin_icao} → {m.destination_icao}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {Math.round(Number(m.distance_nm))} NM · {charter ? `${pax} PAX + ${m.cargo_kg} kg baggage · exclusive cabin` : `${m.cargo_kg} kg`} · deadline {Number(m.deadline_hours)} h after acceptance{m.category === "MEDEVAC" ? " · airport fees 0 SC" : ""} · board expires in {countdown(m.expires_at, now)}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {!fit.capable ? (
          <span className="readout text-xs text-destructive">{"fleetMaxPax" in fit ? `Requires ≥ ${pax} seats and ${m.cargo_kg} kg hold (fleet max: ${fit.fleetMaxPax} seats)` : `Requires ≥ ${m.cargo_kg.toLocaleString()} kg cargo (fleet max: ${fit.fleetMaxKg.toLocaleString()} kg)`}</span>
        ) : !fit.atOrigin ? (
          <span className="readout flex items-center gap-1 text-xs text-amber"><MapPin className="h-3 w-3" />{fit.elsewhereIcao ? `Aircraft at ${fit.elsewhereIcao} · ` : "Aircraft busy · "}reposition to {m.origin_icao} to accept</span>
        ) : (
          <span className="readout flex items-center gap-1 text-xs text-primary"><CheckCircle2 className="h-3 w-3" />{fit.readyRegistration ?? "Aircraft"} ready at {m.origin_icao}{"readyKg" in fit ? ` (All-Cargo ${fit.readyKg.toLocaleString()} kg)` : ""}</span>
        )}
        <span className="readout text-lg text-amber">{formatCr(Number(m.payout))}</span>
        <Button size="sm" variant="outline" aria-expanded={preview} aria-controls={`mission-preview-${m.id}`} onClick={() => setPreview(v => !v)}>{preview ? <ChevronUp className="h-4 w-4" /> : <Map className="h-4 w-4" />}Preview</Button>
        <Button size="sm" disabled={busy || !canAccept || !fit.capable || !fit.atOrigin} title={!fit.capable ? (charter ? "No aircraft in your fleet can seat this charter" : "No aircraft in your fleet can carry this cargo") : !fit.atOrigin ? `Park an available aircraft at ${m.origin_icao} to accept` : canAccept ? undefined : "Complete or abandon your current mission first"} onClick={async () => {
          setBusy(true);
          try { await accept({ data: { mission: m.id } }); await qc.invalidateQueries({ queryKey: ["missions"] }); toast.success("Mission accepted — the clock is running"); }
          catch (e) { toast.error(e instanceof Error ? e.message : "Unable to accept mission"); }
          finally { setBusy(false); }
        }}>Accept</Button>
      </div>
      {preview && <MissionPreview mission={m} fleet={fleet} bonus={bonus} now={now} />}
    </div>
  );
}

function ActiveMission({ mission: m, now, companyId }: { mission: Mission; now: number; companyId: string | null }) {
  const hasCompany = !!companyId;
  const { data: overview } = useSuspenseQuery(fleetOverviewQuery);
  const action = useServerFn(flightAction);
  const cancel = useServerFn(cancelMission);
  const qc = useQueryClient();
  const bonus = Number(overview.rules.all_cargo_capacity_bonus ?? 0.5);
  const candidates = useMemo(
    () => overview.fleet.filter((f) => f.company_id === companyId && !f.returned_at && f.status === "AVAILABLE" && f.location_icao === m.origin_icao && (m.category === "CHARTER"
      ? (f.type?.pax ?? 0) >= missionPax(m) && (f.type?.cargo_kg ?? 0) >= m.cargo_kg
      : (f.type?.cargo_kg ?? 0) * (1 + bonus) >= m.cargo_kg)),
    [overview.fleet, m, bonus, companyId],
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
              {candidates.map((f) => <option key={f.id} value={f.id}>{f.registration} · {f.type?.model} · {m.category === "CHARTER" ? `${f.type?.pax ?? 0} seats` : `${Math.floor((f.type?.cargo_kg ?? 0) * (1 + bonus))} kg All-Cargo`}</option>)}
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
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {m.flight_id && <FlightBriefing flightId={m.flight_id} label="Mission details" size="default" />}
        {m.flight_id && <Button asChild variant="outline"><Link to="/dispatch">Open Dispatch</Link></Button>}
        {!m.flight_id ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={busy} className="text-muted-foreground hover:text-destructive"><Undo2 className="h-4 w-4" />Abandon mission</Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Abandon this mission?</AlertDialogTitle>
                <AlertDialogDescription>{m.origin_icao} → {m.destination_icao} goes back to the shared mission board. There is no penalty and you can accept another mission right away.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Keep mission</AlertDialogCancel>
                <AlertDialogAction onClick={async () => {
                  setBusy(true);
                  try { await cancel({ data: { mission: m.id } }); await qc.invalidateQueries({ queryKey: ["missions"] }); toast.success("Mission returned to the board"); }
                  catch (e) { toast.error(e instanceof Error ? e.message : "Unable to abandon mission"); }
                  finally { setBusy(false); }
                }}>Abandon mission</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : (
          <p className="text-xs text-muted-foreground">To release this mission, manage its flight in Dispatch: cancel it before take-off, or abandon it after a divert.</p>
        )}
      </div>
    </section>
  );
}

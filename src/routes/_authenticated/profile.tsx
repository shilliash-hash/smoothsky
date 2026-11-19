import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Briefcase, Lock, Plane, UserRound, PieChart, Warehouse } from "lucide-react";
import { AppShell } from "@/components/game/AppShell";
import { AcarsConnection } from "@/components/game/AcarsConnection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { companyQuery } from "@/lib/game";
import { formatCr } from "@/lib/rules";
import { buyPersonalAircraft, getPilotOps, getStakeMarket, stakeAction, buyTypeRating, getCareer, getHiringCompanies, getPilotProfile, rosterAction, setCompanyHiring, simbriefUsernameSchema } from "@/lib/pilot.functions";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({ meta: [
    { title: "Pilot profile — SmoothSky" },
    { name: "description", content: "Manage your SmoothSky career, ACARS key, SimBrief ID, type ratings and contracts." },
    { property: "og:title", content: "Pilot profile — SmoothSky" },
    { property: "og:description", content: "Career, ACARS connection, licences and roster contracts in SmoothSky." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Profile,
});

const ratingGroups = [
  { id: "T3_4", label: "Tier 3–4", tiers: [3, 4], hint: "PC-12, King Air 350, Twin Otter" },
  { id: "T5", label: "Tier 5", tiers: [5], hint: "ATR 72-600" },
  { id: "T6_7", label: "Tier 6–7", tiers: [6, 7], hint: "A320neo, 777-300ER" },
] as const;

function Profile() {
  const qc = useQueryClient();
  const { data: company } = useQuery(companyQuery);
  const career = useServerFn(getCareer);
  const { data: c, refetch } = useQuery({ queryKey: ["career"], queryFn: () => career() });
  const loadPilot = useServerFn(getPilotProfile);
  const { data: pilot } = useQuery({ queryKey: ["pilot-profile"], queryFn: () => loadPilot() });
  const hiringFn = useServerFn(getHiringCompanies);
  const { data: hiring = [] } = useQuery({ queryKey: ["hiring"], queryFn: () => hiringFn(), enabled: c?.career_role === "PILOT_ONLY" });
  const buy = useServerFn(buyTypeRating);
  const roster = useServerFn(rosterAction);
  const saveHiring = useServerFn(setCompanyHiring);
  const [simbrief, setSimbrief] = useState("");
  const [h, setH] = useState({ hiring: false, roster: 40, freelance: 25 });
  useEffect(() => { setSimbrief(pilot?.simbriefUsername ?? ""); }, [pilot?.simbriefUsername]);
  useEffect(() => { if (company) setH({ hiring: !!company.is_hiring, roster: Number(company.roster_commission_pct), freelance: Number(company.freelance_commission_pct) }); }, [company]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); await Promise.all([refetch(), qc.invalidateQueries({ queryKey: ["company"] }), qc.invalidateQueries({ queryKey: ["hiring"] })]); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Action failed"); }
  };
  const saveSimbrief = async () => {
    const parsed = simbriefUsernameSchema.safeParse(simbrief);
    if (!parsed.success) { toast.error(parsed.error.issues[0]?.message ?? "Invalid SimBrief ID"); return; }
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("profiles").update({ simbrief_username: parsed.data }).eq("id", u.user!.id);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["pilot-profile"] });
    toast.success("SimBrief ID saved");
  };

  const role = c?.career_role ?? (company ? "ENTREPRENEUR" : null);
  return <AppShell company={company ?? null}>
    <p className="readout flex items-center gap-2 text-xs uppercase text-amber"><UserRound className="h-4 w-4" /> Crew room</p>
    <h1 className="mt-2 text-3xl font-semibold">Pilot profile</h1>

    <div className="mt-6 grid gap-6 lg:grid-cols-3">
      <div className="instrument p-5">
        <p className="text-xs uppercase text-muted-foreground">Career</p>
        <p className="mt-2 text-xl font-semibold">{role === "ENTREPRENEUR" ? "Airline owner" : role === "PILOT_ONLY" ? "Pilot only" : "Not chosen"}</p>
        <p className="mt-1 text-sm text-muted-foreground">{company ? `${company.name} · ${company.icao_code}` : c?.callsign ? `${c.callsign} · based at ${c.pilot_home_icao}` : "Choose your career path to start."}</p>
        <p className="mt-4 text-xs uppercase text-muted-foreground">Pilot wallet</p>
        <p className="readout text-2xl">{formatCr(Number(c?.balance ?? 0))}</p>
        {role !== "ENTREPRENEUR" && <Button asChild className="mt-4 w-full" variant="outline"><Link to="/onboarding">{role === "PILOT_ONLY" ? "Upgrade: found your own airline" : "Choose career"}</Link></Button>}
      </div>
      <div className="lg:col-span-2"><AcarsConnection /></div>
    </div>

    <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <div className="instrument p-5">
        <p className="text-xs uppercase text-muted-foreground">SimBrief</p>
        <Label htmlFor="sb" className="mt-3 block">Username or pilot ID</Label>
        <div className="mt-2 flex gap-2"><Input id="sb" value={simbrief} onChange={e => setSimbrief(e.target.value)} placeholder="e.g. smoothpilot or 123456" /><Button onClick={saveSimbrief}>Save</Button></div>
        <p className="mt-2 text-xs text-muted-foreground">Used to prefill Dispatch from your latest OFP.</p>
      </div>
      <div className="instrument p-5">
        <p className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><BadgeCheck className="h-4 w-4" /> Type ratings</p>
        <p className="mt-2 text-sm">Tier 1–2 included. Higher tiers require a one-time licence paid from your pilot wallet.</p>
        <ul className="mt-3 space-y-2">{ratingGroups.map(g => { const held = g.tiers.every(t => c?.type_ratings?.includes(t)); const price = Number(c?.prices?.[g.id] ?? 0); return (
          <li key={g.id} className="flex items-center justify-between gap-3 border-t border-border pt-2">
            <div><span className="readout text-primary">{g.label}</span><div className="text-xs text-muted-foreground">{g.hint}</div></div>
            {held ? <span className="readout text-xs text-primary">HELD</span> : <Button size="sm" variant="outline" disabled={Number(c?.balance ?? 0) < price} onClick={() => run(() => buy({ data: { group: g.id } }), `${g.label} licence purchased`)}>{formatCr(price)}</Button>}
          </li>); })}</ul>
      </div>
    </div>

    {role === "ENTREPRENEUR" && company && <div className="instrument mt-6 p-5">
      <p className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><Briefcase className="h-4 w-4" /> Recruitment</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-3 sm:items-end">
        <label className="flex items-center gap-3 text-sm"><Switch checked={h.hiring} onCheckedChange={v => setH({ ...h, hiring: v })} /> Hiring pilots</label>
        <div><Label htmlFor="rc">Roster commission (35–50% of net)</Label><Input id="rc" type="number" min={35} max={50} step={1} value={h.roster} onChange={e => setH({ ...h, roster: Number(e.target.value) })} /></div>
        <div><Label htmlFor="fc">Freelance commission (20–30% of net)</Label><Input id="fc" type="number" min={20} max={30} step={1} value={h.freelance} onChange={e => setH({ ...h, freelance: Number(e.target.value) })} /></div>
      </div>
      <Button className="mt-4" onClick={() => run(() => saveHiring({ data: h }), "Recruitment settings saved")}>Save recruitment</Button>
    </div>}

    {role === "PILOT_ONLY" && <div className="instrument mt-6 p-5">
      <p className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><Plane className="h-4 w-4" /> Roster contract</p>
      {c?.roster ? <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p>Flying for <span className="font-semibold">{c.roster.name}</span> <span className="readout text-primary">{c.roster.icao_code}</span> · {c.roster.commission_pct}% commission</p>
        <Button variant="outline" onClick={() => confirm("End your contract?") && run(() => roster({ data: { action: "leave" } }), "Contract ended")}>End contract</Button>
      </div> : <>
        <p className="mt-2 text-sm text-muted-foreground">One contract at a time. Otherwise you fly as a Freelancer.</p>
        <ul className="mt-3 divide-y divide-border">{hiring.map(co => <li key={co.company_id} className="flex flex-wrap items-center justify-between gap-3 py-2">
          <div><span className="font-semibold">{co.name}</span> <span className="readout text-primary">{co.icao_code}</span><div className="text-xs text-muted-foreground">{co.home_base_icao} · {co.fleet_count} aircraft · roster {co.roster_commission_pct}% · freelance {co.freelance_commission_pct}%</div></div>
          <Button size="sm" onClick={() => run(() => roster({ data: { action: "join", companyId: co.company_id } }), `Signed with ${co.name}`)}>Sign contract</Button>
        </li>)}</ul>
        {hiring.length === 0 && <p className="mt-3 text-sm text-muted-foreground">No airlines are hiring right now.</p>}
      </>}
    </div>}

    <StakesAndHangar role={role} companyOffer={company ? Number(company.stake_offer_pct ?? 0) : null} />
  </AppShell>;
}

function StakesAndHangar({ role, companyOffer }: { role: string | null; companyOffer: number | null }) {
  const qc = useQueryClient();
  const loadOps = useServerFn(getPilotOps);
  const loadMarket = useServerFn(getStakeMarket);
  const stake = useServerFn(stakeAction);
  const buyPlane = useServerFn(buyPersonalAircraft);
  const { data: ops, refetch } = useQuery({ queryKey: ["pilot-ops"], queryFn: () => loadOps() });
  const { data: market = [], refetch: refetchMarket } = useQuery({ queryKey: ["stake-market"], queryFn: () => loadMarket() });
  const [pct, setPct] = useState<Record<string, number>>({});
  const [offer, setOffer] = useState(companyOffer ?? 0);
  const [plane, setPlane] = useState({ type: "", registration: "" });
  useEffect(() => { if (companyOffer !== null) setOffer(companyOffer); }, [companyOffer]);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    try { await fn(); toast.success(ok); await Promise.all([refetch(), refetchMarket(), qc.invalidateQueries({ queryKey: ["career"] }), qc.invalidateQueries({ queryKey: ["company"] })]); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Action failed"); }
  };
  const balance = Number(ops?.balance ?? 0);
  return <div className="mt-6 grid gap-6 lg:grid-cols-2">
    <div className="instrument p-5">
      <p className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><PieChart className="h-4 w-4" /> Airline stakes</p>
      {role === "ENTREPRENEUR" && companyOffer !== null && <div className="mt-3">
        <Label htmlFor="so">Stake offered to pilots (0–30% of your airline)</Label>
        <div className="mt-2 flex gap-2"><Input id="so" type="number" min={0} max={30} step={1} value={offer} onChange={e => setOffer(Number(e.target.value))} />
          <Button onClick={() => run(() => stake({ data: { action: "offer", pct: offer } }), "Stake offer saved")}>Save</Button></div>
        <p className="mt-2 text-xs text-muted-foreground">Stakes are priced from net worth. Each week stakeholders receive their share of 50% of operating profit (adjustable by admins).</p>
      </div>}
      {ops && ops.stakes.length > 0 && <>
        <p className="mt-4 text-xs uppercase text-muted-foreground">Your stakes · dividends received {formatCr(Number(ops.dividends_total))}</p>
        <ul className="mt-2 divide-y divide-border">{ops.stakes.map(s => { const locked = new Date(s.locked_until).getTime() > Date.now(); return <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
          <div><span className="font-semibold">{s.company_name}</span> <span className="readout text-primary">{s.icao_code}</span> · {s.pct}%
            <div className="text-xs text-muted-foreground">Paid {formatCr(Number(s.price_paid))} · now {formatCr(Number(s.current_value))} · next dividend {new Date(s.next_dividend_at).toISOString().slice(0, 10)}</div></div>
          <Button size="sm" variant="outline" disabled={locked} title={locked ? `Locked until ${new Date(s.locked_until).toISOString().slice(0, 16).replace("T", " ")} UTC` : undefined}
            onClick={() => confirm(`Sell back for about ${formatCr(Number(s.current_value))}?`) && run(() => stake({ data: { action: "sell", stakeId: s.id } }), "Stake sold")}>{locked ? <><Lock className="h-3 w-3" /> Locked</> : "Sell"}</Button>
        </li>; })}</ul>
      </>}
      <p className="mt-4 text-xs uppercase text-muted-foreground">Stakes on offer</p>
      {market.length === 0 && <p className="mt-2 text-sm text-muted-foreground">No airline is offering stakes right now.</p>}
      <ul className="mt-2 divide-y divide-border">{market.map(m => { const avail = Number(m.offered_pct) - Number(m.sold_pct); const want = pct[m.company_id] ?? 1; const price = want * Number(m.price_per_pct); return <li key={m.company_id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
        <div><span className="font-semibold">{m.name}</span> <span className="readout text-primary">{m.icao_code}</span>
          <div className="text-xs text-muted-foreground">Net worth {formatCr(Number(m.net_worth))} · {avail}% available · {formatCr(Number(m.price_per_pct))} per 1%</div></div>
        {avail > 0 && <div className="flex items-center gap-2"><Input className="w-20" type="number" min={0.5} max={avail} step={0.5} value={want} onChange={e => setPct({ ...pct, [m.company_id]: Number(e.target.value) })} />
          <Button size="sm" disabled={want <= 0 || want > avail || price > balance} onClick={() => run(() => stake({ data: { action: "buy", companyId: m.company_id, pct: want } }), `Bought ${want}% of ${m.name}`)}>{formatCr(price)}</Button></div>}
      </li>; })}</ul>
      <p className="mt-2 text-xs text-muted-foreground">Bought stakes cannot be sold back for 7 days.</p>
    </div>
    <div className="instrument p-5">
      <p className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><Warehouse className="h-4 w-4" /> Personal hangar</p>
      {role !== "PILOT_ONLY" ? <p className="mt-3 text-sm text-muted-foreground">Available to Pilot Only careers. Airline owners buy aircraft in the Aircraft market.</p>
      : ops?.has_personal ? <p className="mt-3 text-sm">You own a personal aircraft. Fly it from <Link to="/crew" className="text-primary underline">Crew ops</Link> — you pay all costs and keep all revenue.</p>
      : <>
        <p className="mt-2 text-sm">Buy one Tier 1–3 aircraft and fly it on your own account: 100% of costs and 100% of profit go to your wallet.</p>
        <select className="mt-3 w-full rounded-sm border border-border bg-background px-2 py-2 text-sm" value={plane.type} onChange={e => setPlane({ ...plane, type: e.target.value })}>
          <option value="">Choose aircraft…</option>
          {ops?.personal_types.map(t => <option key={t.id} value={t.id} disabled={!ops.type_ratings.includes(t.tier)}>{t.model} · T{t.tier} · {t.pax} pax · {formatCr(Number(t.purchase_price))}{ops.type_ratings.includes(t.tier) ? "" : " (rating required)"}</option>)}
        </select>
        <Input className="mt-2" placeholder="Registration (optional, assigned if empty)" value={plane.registration} onChange={e => setPlane({ ...plane, registration: e.target.value.toUpperCase() })} />
        {(() => { const t = ops?.personal_types.find(x => x.id === plane.type); return <Button className="mt-3 w-full" disabled={!t || Number(t.purchase_price) > balance}
          onClick={() => run(() => buyPlane({ data: { type: plane.type, registration: plane.registration || undefined } }), "Personal aircraft purchased")}>{t ? `Buy for ${formatCr(Number(t.purchase_price))}` : "Buy aircraft"}</Button>; })()}
        <p className="mt-2 text-xs text-muted-foreground">Wallet: {formatCr(balance)}. Earn SC with roster or freelance flights first.</p>
      </>}
    </div>
  </div>;
}

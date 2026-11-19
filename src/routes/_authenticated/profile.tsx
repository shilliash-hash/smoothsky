import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Briefcase, Lock, Plane, UserRound } from "lucide-react";
import { AppShell } from "@/components/game/AppShell";
import { AcarsConnection } from "@/components/game/AcarsConnection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { companyQuery } from "@/lib/game";
import { formatCr } from "@/lib/rules";
import { buyTypeRating, getCareer, getHiringCompanies, getPilotProfile, rosterAction, setCompanyHiring, simbriefUsernameSchema } from "@/lib/pilot.functions";

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

    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      {["Airline stakes & dividends", "Personal hangar"].map(t => <div key={t} className="rounded-sm border border-dashed border-border p-4 text-sm text-muted-foreground"><Lock className="mr-2 inline h-4 w-4" />{t} — coming in the next update.</div>)}
    </div>
  </AppShell>;
}

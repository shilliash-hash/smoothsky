import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { fleetOverviewQuery, registrationRulesQuery } from "@/lib/fleet";
import { leaseAction, purchaseAircraft, rentAircraft } from "@/lib/fleet.functions";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AcquisitionConfirmation } from "@/components/game/AcquisitionConfirmation";
import { getCareer } from "@/lib/pilot.functions";
import { queryOptions } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { aircraftTypesQuery, companyQuery, fleetQuery, ledgerQuery } from "@/lib/game";
import { economyQuery } from "@/lib/game";
import { canAffordLease, formatCr, leaseUpfrontCost } from "@/lib/rules";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/game/AppShell";
import { basesQuery } from "@/lib/bases";
import { canInvest } from "@/lib/bases-rules";
import { acquisitionBlock, acquisitionDue, canAcquireWithLicense, DEFAULT_SPOT_RENTAL_MULTIPLIER, spotRentalPrice, type AcquisitionMode } from '@/lib/market-rules';
import { registrationRule } from '@/lib/registration-rules';

const rentalCareerQuery = queryOptions({ queryKey: ["career"], queryFn: () => getCareer() });

export const Route = createFileRoute("/_authenticated/market")({
  beforeLoad: async ({ context }) => {
    const c = await context.queryClient.fetchQuery(companyQuery);
    if (!c) throw redirect({ to: "/onboarding" });
  },
  loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(fleetOverviewQuery), context.queryClient.ensureQueryData(registrationRulesQuery), context.queryClient.ensureQueryData(basesQuery), context.queryClient.ensureQueryData(rentalCareerQuery), context.queryClient.ensureQueryData(economyQuery)]); },
  head: () => ({ meta: [{ title: "Aircraft market — SmoothSky" }, { name: "description", content: "Buy, lease or rent aircraft for one flight in SmoothSky." }, { property: "og:title", content: "Aircraft market — SmoothSky" }, { property: "og:description", content: "Buy, lease or rent aircraft for one flight in SmoothSky." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Market,
});

function Market() {
  const qc = useQueryClient();
  const { data: overview } = useSuspenseQuery(fleetOverviewQuery);
  const { data: bases } = useSuspenseQuery(basesQuery);
  const invest = bases.health ? canInvest(bases.health.status) : false;
  const action = useServerFn(leaseAction);
  const buy = useServerFn(purchaseAircraft);
  const rent = useServerFn(rentAircraft);
  const { data: career } = useSuspenseQuery(rentalCareerQuery);
  const { data: registrationRules } = useSuspenseQuery(registrationRulesQuery);
  const [mode, setMode] = useState<AcquisitionMode>("lease");
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [registration, setRegistration] = useState("");
  const [weeks, setWeeks] = useState(overview.rules.default_lease_weeks);
  const { data: economy } = useSuspenseQuery(economyQuery);
  const rentalMultiplier = Number(economy['spot_rental_multiplier'] ?? DEFAULT_SPOT_RENTAL_MULTIPLIER);
  const { data: company } = useSuspenseQuery(companyQuery);
  const c = company;
  const { data: types = [] } = useQuery(aircraftTypesQuery);
  const { data: ledger = [] } = useQuery(ledgerQuery(c?.id ?? ""));
  const { data: fleet = [] } = useQuery(fleetQuery(c?.id ?? ""));
  const [busy, setBusy] = useState<string | null>(null);
  const balance = bases.health?.balance ?? ledger[0]?.balance_after ?? 0;
  const full = fleet.filter(f=>f.ownership === "LEASED").length >= Number(economy?.['max_active_leases'] ?? 3);

  if (!c) return null;
  const rule = registrationRule(registrationRules, c.home_base?.country);
  const block = acquisitionBlock({ health: bases.health, ...(mode === 'lease' ? { weeks } : {}), busy: busy !== null });
  const purchaseType = types.find(t=>t.id===purchasing);
  const confirmationBlock = purchaseType ? (!canAcquireWithLicense(mode, purchaseType.tier, career.type_ratings) ? `Requires Tier ${purchaseType.tier} license` : block ?? (mode === 'lease' && full ? 'Fleet limit reached' : mode === 'buy' && purchaseType.purchase_price <= 0 ? 'Not for sale' : balance < acquisitionDue(mode, purchaseType, rentalMultiplier) ? 'Insufficient funds' : null)) : null;
  async function confirmAcquisition() {
    if (!purchaseType || busy || confirmationBlock) return;
    setBusy(purchaseType.id);
    try {
      if (mode === 'lease') await action({ data: { action: 'sign', type: purchaseType.id, weeks } });
      else if (mode === 'rent') await rent({ data: { type: purchaseType.id, registration } });
      else await buy({ data: { type: purchaseType.id, registration } });
      setPurchasing(null);
      await qc.invalidateQueries();
      toast.success(mode === 'rent' ? 'Single-flight rental delivered to your home base' : mode === 'lease' ? 'Lease signed — aircraft at your home base' : 'Aircraft purchased — delivered to your home base');
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Acquisition failed'); }
    finally { setBusy(null); }
  }

  return (
    <AppShell company={c}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="readout text-xs uppercase text-amber">Fleet acquisition</p>
          <h1 className="mt-1 text-3xl font-semibold">Aircraft market</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">{mode === "lease" ? "Security deposit and first weekly payment due upfront." : mode === "rent" ? `One flight · ${Number((rentalMultiplier * 100).toFixed(2))}% of weekly rate · no deposit or weekly commitments.` : "Purchase outright · delivered to your home base · no weekly lease payments."}</p>
        </div>
        <div className="instrument px-4 py-3 text-right">
          <p className="text-xs uppercase text-muted-foreground">Available funds</p>
          <p className="readout text-xl text-primary">{formatCr(balance)}</p>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2"><Tabs value={mode} onValueChange={value => { if (value === "lease" || value === "rent" || value === "buy") setMode(value); }}><TabsList><TabsTrigger value="lease">Lease</TabsTrigger><TabsTrigger value="rent">Spot Rent (1 Flight)</TabsTrigger><TabsTrigger value="buy">Buy aircraft</TabsTrigger></TabsList></Tabs>
      <Button asChild variant="outline" size="sm"><Link to="/used-market">Used market</Link></Button></div>
      {!invest && <p role="alert" className="mt-4 text-destructive">Outstanding obligations · Aircraft acquisitions suspended</p>}
      {invest && block && <p role="alert" className="mt-4 text-amber">{block}{!rule && ` (${c.home_base?.country ?? 'unknown'})`}</p>}
      {mode === "lease" && <label className="mt-6 flex items-center gap-3 text-sm">Contract term (weeks)
        <Input aria-label="Contract term (weeks)" type="number" min={1} max={52} step={1} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="w-24" />
      </label>}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {types.filter(t=>t.active).map((t) => {
          const afford = canAffordLease(balance, t);
          const reason = !canAcquireWithLicense(mode, t.tier, career.type_ratings) ? `Requires Tier ${t.tier} license` : block ?? (mode === 'lease' && full ? 'Fleet limit reached' : mode === 'buy' && t.purchase_price <= 0 ? 'Not for sale' : (mode === 'lease' ? !afford : balance < acquisitionDue(mode, t, rentalMultiplier)) ? 'Insufficient funds' : null);
          return (
            <div key={t.id} className="instrument flex flex-col p-5">
              <div className="flex items-center justify-between">
                <span className="readout rounded-sm border border-amber/40 px-2 py-0.5 text-xs text-amber">T{t.tier}</span>
                <span className="readout text-xs text-muted-foreground">{t.id}</span>
              </div>
              <h3 className="mt-3 text-xl font-semibold">{t.manufacturer} {t.model}</h3>
              <p className="text-sm text-muted-foreground">{t.engine}</p>
              <dl className="readout mt-4 grid grid-cols-2 gap-y-2 border-y border-border py-3 text-sm">
                <dt className="text-muted-foreground">Passengers</dt><dd className="text-right">{t.pax}</dd>
                <dt className="text-muted-foreground">Cargo</dt><dd className="text-right">{t.cargo_kg} kg</dd>
                <dt className="text-muted-foreground">Range</dt><dd className="text-right">{t.range_nm} NM</dd>
                <dt className="text-muted-foreground">Cruise</dt><dd className="text-right">{t.cruise_kts} kt</dd>
              </dl>
              {mode === "lease" ? <div className="readout mt-4 space-y-1 border-t border-border pt-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Contract total (excl. deposit)</span><span>{formatCr(t.weekly_rate * weeks)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Deposit</span><span>{formatCr(t.security_deposit)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Weekly rate</span><span className="text-amber">{formatCr(t.weekly_rate)}</span></div>
                <div className="flex justify-between font-semibold"><span>Upfront total</span><span className="text-primary">{formatCr(leaseUpfrontCost(t))}</span></div>
              </div> : mode === "rent" ? <div className="readout mt-4 space-y-2 border-t border-border pt-4 text-sm"><div className="flex justify-between gap-2"><span className="text-muted-foreground">Single-flight rental</span><span className="text-primary">{formatCr(spotRentalPrice(t.weekly_rate, rentalMultiplier))}</span></div><div className="flex justify-between gap-2"><span className="text-muted-foreground">Deposit / weekly payments</span><span>{formatCr(0)}</span></div><p className="text-xs text-amber">SPOT RENTAL · 1 FLIGHT</p></div> : <div className="readout mt-4 border-t border-border pt-4"><p className="text-xs text-muted-foreground">Purchase price · no weekly lease</p><p className="mt-2 text-xl text-primary">{formatCr(t.purchase_price)}</p></div>}
              <Button className="mt-5" title={reason ?? undefined} disabled={reason !== null} onClick={() => { setPurchasing(t.id); setRegistration(""); }}>{reason ?? (mode === 'lease' ? 'Lease aircraft' : mode === 'rent' ? 'Rent for 1 Flight' : 'Buy aircraft')}</Button>
            </div>
          );
        })}
      </div>
      {purchasing && purchaseType && <AcquisitionConfirmation mode={mode} aircraft={purchaseType} rentalMultiplier={rentalMultiplier} home={c.home_base_icao} weeks={weeks} balance={balance} registration={registration} rule={rule} busy={busy !== null} block={busy ? null : confirmationBlock} onRegistration={setRegistration} onClose={() => setPurchasing(null)} onConfirm={() => void confirmAcquisition()} />}
    </AppShell>
  );
}

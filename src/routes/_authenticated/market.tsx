import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { fleetOverviewQuery } from "@/lib/fleet";
import { leaseAction } from "@/lib/fleet.functions";
import { Input } from "@/components/ui/input";
import { aircraftTypesQuery, companyQuery, fleetQuery, ledgerQuery } from "@/lib/game";
import { economyQuery } from "@/lib/game";
import { canAffordLease, formatCr, leaseUpfrontCost } from "@/lib/rules";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/game/AppShell";

export const Route = createFileRoute("/_authenticated/market")({
  beforeLoad: async ({ context }) => {
    const c = await context.queryClient.fetchQuery(companyQuery);
    if (!c) throw redirect({ to: "/onboarding" });
  },
  loader: ({ context }) => context.queryClient.ensureQueryData(fleetOverviewQuery),
  head: () => ({ meta: [{ title: "Lease market — SmoothSky" }, { name: "description", content: "Compare and lease T1–T3 aircraft for your SmoothSky fleet." }, { property: "og:title", content: "Lease market — SmoothSky" }, { property: "og:description", content: "Compare and lease T1–T3 aircraft for your SmoothSky fleet." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: Market,
});

function Market() {
  const qc = useQueryClient();
  const { data: overview } = useSuspenseQuery(fleetOverviewQuery);
  const action = useServerFn(leaseAction);
  const [weeks, setWeeks] = useState(overview.rules.default_lease_weeks);
  const { data: economy } = useQuery(economyQuery);
  const { data: company } = useSuspenseQuery(companyQuery);
  const c = company;
  const { data: types = [] } = useQuery(aircraftTypesQuery);
  const { data: ledger = [] } = useQuery(ledgerQuery(c?.id ?? ""));
  const { data: fleet = [] } = useQuery(fleetQuery(c?.id ?? ""));
  const [busy, setBusy] = useState<string | null>(null);
  const balance = ledger[0]?.balance_after ?? 0;
  const full = fleet.length >= Number(economy?.['max_active_leases'] ?? 3);

  if (!c) return null;

  async function lease(id: string) {
    setBusy(id);
    try {
      await action({ data: { action: "sign", type: id, weeks } });
      await qc.invalidateQueries();
      toast.success("Lease signed — aircraft at your home base");
    } catch (e) { toast.error(e instanceof Error ? e.message : "Lease failed"); }
    finally { setBusy(null); }
  }

  return (
    <AppShell company={c}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="readout text-xs uppercase text-amber">Standard Dry Lease</p>
          <h1 className="mt-1 text-3xl font-semibold">Lease market</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Pay the security deposit and first weekly payment upfront. The weekly rate applies regardless of flight activity. Fuel and maintenance are your responsibility.</p>
        </div>
        <div className="instrument px-4 py-3 text-right">
          <p className="text-xs uppercase text-muted-foreground">Available funds</p>
          <p className="readout text-xl text-primary">{formatCr(balance)}</p>
        </div>
      </div>
      <label className="mt-6 flex items-center gap-3 text-sm">Contract term (weeks)
        <Input aria-label="Contract term (weeks)" type="number" min={1} max={52} step={1} value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} className="w-24" />
      </label>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {types.filter(t=>t.active).map((t) => {
          const afford = canAffordLease(balance, t);
          return (
            <div key={t.id} className="instrument flex flex-col p-5">
              <div className="flex items-center justify-between">
                <span className="readout rounded-sm border border-amber/40 px-2 py-0.5 text-xs text-amber">T{t.tier}</span>
                <span className="readout text-xs text-muted-foreground">{t.id}</span>
              </div>
              <h3 className="mt-3 text-xl font-semibold">{t.manufacturer} {t.model}</h3>
              <p className="text-sm text-muted-foreground">{t.engine}</p>
              <dl className="readout mt-4 grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-muted-foreground">Passengers</dt><dd className="text-right">{t.pax}</dd>
                <dt className="text-muted-foreground">Cargo</dt><dd className="text-right">{t.cargo_kg} kg</dd>
                <dt className="text-muted-foreground">Range</dt><dd className="text-right">{t.range_nm} NM</dd>
                <dt className="text-muted-foreground">Cruise</dt><dd className="text-right">{t.cruise_kts} kt</dd>
              </dl>
              <div className="readout mt-4 space-y-1 border-t border-border pt-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Contract total (excl. deposit)</span><span>{formatCr(t.weekly_rate * weeks)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Deposit</span><span>{formatCr(t.security_deposit)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Weekly rate</span><span className="text-amber">{formatCr(t.weekly_rate)}</span></div>
                <div className="flex justify-between font-semibold"><span>Upfront total</span><span className="text-primary">{formatCr(leaseUpfrontCost(t))}</span></div>
              </div>
              <Button className="mt-5" disabled={!afford || full || busy !== null || !Number.isInteger(weeks) || weeks < 1 || weeks > 52} onClick={() => lease(t.id)}>
                {full ? "Fleet limit reached" : !afford ? "Insufficient funds" : busy === t.id ? "Signing…" : "Lease aircraft"}
              </Button>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}

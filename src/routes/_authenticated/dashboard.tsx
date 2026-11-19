import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { companyQuery, fleetQuery, ledgerQuery } from "@/lib/game";
import { economyQuery } from "@/lib/game";
import { formatCr } from "@/lib/rules";
import { Button } from "@/components/ui/button";
import { SmoothCoin } from "@/components/game/SmoothCoin";
import { AppShell } from "@/components/game/AppShell";
import { useState } from "react";
import { fleetOverviewQuery, companyResultsQuery } from "@/lib/fleet";
import { CompanyResults } from "@/components/game/CompanyResults";
import { AircraftDetails } from "@/components/game/AircraftDetails";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: async ({ context }) => {
    const c = await context.queryClient.fetchQuery(companyQuery);
    if (!c) throw redirect({ to: "/onboarding" });
  },
  head: () => ({ meta: [{ title: "Dashboard — SmoothSky" }, { name: "description", content: "Your SmoothSky airline balance, fleet, home base and transaction history." }, { property: "og:title", content: "Dashboard — SmoothSky" }, { property: "og:description", content: "Your SmoothSky airline balance, fleet, home base and transaction history." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  loader: async ({ context }) => { await Promise.all([context.queryClient.ensureQueryData(fleetOverviewQuery), context.queryClient.ensureQueryData(companyResultsQuery)]); },
  component: Dashboard,
});

const typeLabel: Record<string, string> = { AIRCRAFT_PURCHASE: "Aircraft purchase", LEASE_DEPOSIT_REFUND: "Lease deposit refund", TICKET_REVENUE: "Ticket revenue", FUEL_EXPENSE: "Fuel", AIRPORT_FEES: "Airport fees", HANDLING_FEES: "Handling", MAINTENANCE_RESERVE: "Maintenance reserve", INITIAL_GRANT: "Starting capital", LEASE_DEPOSIT: "Lease deposit", LEASE_PAYMENT: "Lease payment" };

function Dashboard() {
  const { data: overview } = useSuspenseQuery(fleetOverviewQuery);
  const [selected, setSelected] = useState<string | null>(null);
  const { data: company } = useSuspenseQuery(companyQuery);
  const { data: economy } = useQuery(economyQuery);
  const c = company;
  const { data: ledger = [] } = useQuery(ledgerQuery(c?.id ?? ""));
  const { data: fleet = [] } = useQuery(fleetQuery(c?.id ?? ""));
  const balance = ledger[0]?.balance_after ?? 0;
  if (!c) return null;
  const hb = c.home_base;

  return (
    <AppShell company={c}>
      <p className="readout text-xs uppercase text-amber">{c.icao_code} · Operations Center</p>
      <h1 className="mt-1 text-3xl font-semibold">{c.name}</h1>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_2fr_1fr]">
        <div className="instrument p-5">
          <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><SmoothCoin className="h-5 w-5 text-xs" /> Balance</div>
          <p className="readout mt-2 text-3xl text-primary">{formatCr(balance)}</p>
        </div>
        <CompanyResults />
        <div className="instrument p-5">
          <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><MapPin className="h-4 w-4" /> Home base</div>
          <p className="readout mt-2 text-3xl text-amber">{hb?.icao}</p>
          <p className="text-sm text-muted-foreground">{hb?.name}, {hb?.city} · {hb?.lat.toFixed(3)}, {hb?.lon.toFixed(3)}</p>
          <p className="mt-1 flex items-center gap-1 text-xs text-success">● Base active · no FOB</p>
        </div>
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Fleet <span className="text-xs text-muted-foreground">{fleet.filter(f=>f.ownership === "LEASED").length} / {Number(economy?.["max_active_leases"] ?? 3)} leased · {fleet.filter(f=>f.ownership === "OWNED").length} owned</span></h2>
          <Button asChild size="sm" variant="outline"><Link to="/market">Aircraft market</Link></Button>
        </div>
        {fleet.length === 0 ? (
          <div className="mt-3 border-y border-border py-8 text-center">
            <p className="text-muted-foreground">No aircraft in your fleet yet.</p>
            <Button asChild className="mt-4"><Link to="/market">Lease your first aircraft</Link></Button>
          </div>
        ) : (
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {fleet.map((f) => (
              <Button key={f.id} variant="outline" aria-label={`Aircraft accounts ${f.registration}`} onClick={() => setSelected(f.id)} className="instrument block h-auto w-full p-4 text-left font-normal whitespace-normal">
                <div className="flex items-center justify-between">
                  <span className="readout text-lg text-primary">{f.registration}</span>
                  <span className="rounded-sm bg-success/15 px-2 py-0.5 text-xs text-success">{f.status === "AVAILABLE" ? "Available" : f.status}</span>
                </div>
                <p className="mt-1 text-sm">{f.type?.manufacturer} {f.type?.model}</p>
                <dl className="readout mt-3 grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                  <dt>Location</dt><dd className="text-right text-foreground">{f.location_icao}</dd>
                  {f.ownership === "OWNED" ? <><dt>Ownership</dt><dd className="text-right text-primary">Owned</dd><dt>Asset value</dt><dd className="text-right">{formatCr(f.purchase_price)}</dd></> : <><dt>Weekly rate</dt><dd className="text-right text-amber">{formatCr(f.weekly_rate)}</dd>
                  <dt>Contract ends</dt><dd className="text-right text-foreground">{new Date(overview.contracts.find(k => k.aircraft_id === f.id)?.ends_at ?? f.next_payment_due).toLocaleDateString("en-US")}</dd>
                  <dt>Next payment</dt><dd className="text-right text-foreground">{new Date(f.next_payment_due).toLocaleDateString("en-US")}</dd></>}
                </dl>
              </Button>
            ))}
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Transaction history</h2>
        <div className="mt-3 overflow-x-auto border-y border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border"><th className="p-3">Date</th><th className="p-3">Type</th><th className="p-3">Description</th><th className="p-3">Accounts (Dr / Cr)</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">Balance</th></tr>
            </thead>
            <tbody className="readout">
              {ledger.map((e) => (
                <tr key={e.id} className="border-b border-border/50 last:border-0">
                  <td className="p-3 text-muted-foreground">{new Date(e.created_at).toLocaleString("en-US")}</td>
                  <td className="p-3">{typeLabel[e.entry_type] ?? e.entry_type}</td>
                  <td className="p-3 font-sans">{e.description}</td>
                  <td className="p-3 text-xs text-muted-foreground">{e.debit_account} / {e.credit_account}</td>
                  <td className={`p-3 text-right ${e.company_delta >= 0 ? "text-success" : "text-destructive"}`}>{e.company_delta >= 0 ? "+" : ""}{formatCr(e.company_delta)}</td>
                  <td className="p-3 text-right">{formatCr(e.balance_after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {selected && (() => { const f = overview.fleet.find(f => f.id === selected); return f ? <AircraftDetails aircraft={f.id} registration={f.registration} baseRate={Number(f.type?.weekly_rate ?? f.weekly_rate)} renewalDiscount={Number(overview.rules.renewal_discount)} onClose={() => setSelected(null)} /> : null; })()}
    </AppShell>
  );
}

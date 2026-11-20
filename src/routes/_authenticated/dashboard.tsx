import { displayTerminology } from "@/lib/display-terminology";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { companyQuery, fleetQuery, ledgerQuery, ledgerAircraftQuery, transactionHistoryQuery } from "@/lib/game";
import { economyQuery } from "@/lib/game";
import { formatCr } from "@/lib/rules";
import { Button } from "@/components/ui/button";
import { SmoothCoin } from "@/components/game/SmoothCoin";
import { AppShell } from "@/components/game/AppShell";
import { useState } from "react";
import { fleetOverviewQuery, companyResultsQuery } from "@/lib/fleet";
import { FleetCarousel } from "@/components/game/FleetCarousel";
import { CompanyResults } from "@/components/game/CompanyResults";
import { AircraftDetails } from "@/components/game/AircraftDetails";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { flightTransactionContext } from "@/lib/transaction-history";
import { basesQuery } from "@/lib/bases";
import { baseAction } from "@/lib/bases.functions";
import { healthTone } from "@/lib/bases-rules";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: async ({ context }) => {
    const c = await context.queryClient.fetchQuery(companyQuery);
    if (!c) throw redirect({ to: "/onboarding" });
  },
  head: () => ({ meta: [{ title: "Dashboard — SmoothSky" }, { name: "description", content: "Your SmoothSky airline balance, fleet, home base and transaction history." }, { property: "og:title", content: "Dashboard — SmoothSky" }, { property: "og:description", content: "Your SmoothSky airline balance, fleet, home base and transaction history." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  loader: async ({ context }) => { await context.queryClient.ensureQueryData(basesQuery); await Promise.all([context.queryClient.ensureQueryData(fleetOverviewQuery), context.queryClient.ensureQueryData(companyResultsQuery)]); },
  component: Dashboard,
});

const typeLabel: Record<string, string> = { SPOT_RENTAL: "Single-flight rental", FOB_SETUP: "FBO setup", FOB_MODULE: "FBO module", FOB_UPKEEP: "FBO upkeep", RESTRUCTURE_ASSETS: "Asset recovery", RESTRUCTURE_GRANT: "Restructuring", AIRCRAFT_PURCHASE: "Aircraft purchase", LEASE_DEPOSIT_REFUND: "Lease deposit refund", TICKET_REVENUE: "Ticket revenue", FUEL_EXPENSE: "Fuel", AIRPORT_FEES: "Airport fees", HANDLING_FEES: "Handling", MAINTENANCE_RESERVE: "Maintenance reserve", INITIAL_GRANT: "Starting capital", LEASE_DEPOSIT: "Lease deposit", LEASE_PAYMENT: "Lease payment" };

function Dashboard() {
  const { data: bases } = useSuspenseQuery(basesQuery);
  const recover = useServerFn(baseAction);
  const qc = useQueryClient();
  const [restructure, setRestructure] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [recovering, setRecovering] = useState(false);
  const { data: overview } = useSuspenseQuery(fleetOverviewQuery);
  const [selected, setSelected] = useState<string | null>(null);
  const [ledgerAircraft, setLedgerAircraft] = useState<string | null>(null);
  const { data: company } = useSuspenseQuery(companyQuery);
  const { data: economy } = useQuery(economyQuery);
  const c = company;
  const { data: ledger = [] } = useQuery(ledgerQuery(c?.id ?? ""));
  const { data: fleet = [] } = useQuery(fleetQuery(c?.id ?? ""));
  const { data: historyAircraft = [] } = useQuery(ledgerAircraftQuery(c?.id ?? ""));
  const { data: transactions = [], isPending: historyPending, error: historyError } = useQuery(transactionHistoryQuery(c?.id ?? "", ledgerAircraft));
  const balance = bases.health?.balance ?? ledger[0]?.balance_after ?? 0;
  if (!c) return null;
  const hb = c.home_base;

  return (
    <AppShell company={c}>
      <div className="flex items-center gap-4">
        <div>
          <p className="readout text-xs uppercase text-amber">{c.icao_code} · Operations Center · SmoothSky Network</p>
          <h1 className="mt-1 text-3xl font-semibold">{c.name}</h1>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_2fr_1fr]">
        <div className="instrument p-5">
          <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><SmoothCoin className="h-5 w-5 text-xs" /> Balance</div>
          <p className="readout mt-2 text-3xl text-primary">{formatCr(balance)}</p>
          {bases.health && <div className="mt-3 space-y-2"><p className={`readout text-xs ${healthTone[bases.health.status]}`}>● {bases.health.status}</p><p className="text-xs text-muted-foreground">{formatCr(bases.health.weekly_obligations)} / week committed</p>{bases.health.debt > 0 && <p className="text-xs text-destructive">Outstanding debt {formatCr(bases.health.debt)}</p>}{bases.health.next_payment_due && <p className="text-xs text-muted-foreground">Next due {new Date(bases.health.next_payment_due).toLocaleDateString("en-US")}</p>}{bases.health.status === "INSOLVENT" && <Button size="sm" variant="destructive" onClick={() => setRestructure(true)}>Restructure company</Button>}</div>}
        </div>
        <CompanyResults />
        <div className="instrument p-5">
          <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground"><MapPin className="h-4 w-4" /> Home base</div>
          <p className="readout mt-2 text-3xl text-amber">{hb?.icao}</p>
          <p className="text-sm text-muted-foreground">{hb?.name}, {hb?.city} · {hb?.lat.toFixed(3)}, {hb?.lon.toFixed(3)}</p>
          <p className="mt-2 text-xs text-success">{bases.bases.find(b => b.airport_icao === c.home_base_icao)?.base_type ? `● ${bases.bases.find(b => b.airport_icao === c.home_base_icao)?.base_type} FBO active` : "Home airport · No FBO installed"}</p><Button asChild variant="outline" size="sm" className="mt-3"><Link to="/bases">Manage bases · {bases.bases.length} active</Link></Button>
        </div>
      </div>

      <section className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Fleet <span className="text-xs text-muted-foreground">{fleet.filter(f=>f.ownership === "LEASED").length} / {Number(economy?.["max_active_leases"] ?? 3)} leased · {fleet.filter(f=>f.ownership === "OWNED").length} owned · {fleet.filter(f=>f.ownership === "RENTAL").length} rentals</span></h2>
          <Button asChild size="sm" variant="outline"><Link to="/market">Aircraft market</Link></Button>
        </div>
        {fleet.length === 0 ? (
          <div className="mt-3 border-y border-border py-8 text-center">
            <p className="text-muted-foreground">No aircraft in your fleet yet.</p>
            <Button asChild className="mt-4"><Link to="/market">Lease your first aircraft</Link></Button>
          </div>
        ) : (
          <FleetCarousel companyId={c.id} fleet={fleet} contractEnd={id => overview.contracts.find(k => k.aircraft_id === id)?.ends_at} onSelect={setSelected} />
        )}
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Transaction history</h2>
          <Select value={ledgerAircraft ?? "all"} onValueChange={(value) => setLedgerAircraft(value === "all" ? null : value)}>
            <SelectTrigger aria-label="Filter transactions by aircraft" className="w-full sm:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All aircraft & company entries</SelectItem>
              {historyAircraft.map((aircraft) => <SelectItem key={aircraft.id} value={aircraft.id}>{aircraft.registration}{aircraft.returned_at ? " · Returned" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-3 overflow-x-auto border-y border-border">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr className="border-b border-border"><th className="p-3">Date</th><th className="p-3">Type</th><th className="p-3">Description</th><th className="p-3">Accounts (Dr / Cr)</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">Balance</th></tr>
            </thead>
            <tbody className="readout">
              {(historyPending || historyError || transactions.length === 0) && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">{historyPending ? "Loading transactions…" : historyError ? "Unable to load transactions." : "No transactions for this aircraft."}</td></tr>}
              {transactions.map((e) => (
                <tr key={e.id} className="border-b border-border/50 last:border-0">
                  <td className="p-3 text-muted-foreground">{new Date(e.created_at).toLocaleString("en-US")}</td>
                  <td className="p-3">{typeLabel[e.entry_type] ?? e.entry_type}</td>
                  <td className="p-3 font-sans">{flightTransactionContext(e) ? <span className="readout text-primary">{flightTransactionContext(e)}</span> : displayTerminology(e.description)}</td>
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
      <Dialog open={restructure} onOpenChange={open => { if (!recovering) setRestructure(open); }}><DialogContent><DialogTitle>Controlled company restructuring</DialogTitle><DialogDescription>All aircraft will be returned or liquidated at their recorded purchase value. All FBOs will close without refunds. Cash will restart at the current starting-capital setting; company identity and transaction history remain. Finish or cancel active flights first.</DialogDescription><label className="text-sm">Type RESTRUCTURE to confirm<Input aria-label="Restructuring confirmation" value={confirmation} onChange={e => setConfirmation(e.target.value)} className="mt-2" /></label><div className="flex justify-end gap-3"><Button variant="outline" disabled={recovering} onClick={() => setRestructure(false)}>Cancel</Button><Button variant="destructive" disabled={recovering || confirmation !== "RESTRUCTURE"} onClick={async () => { setRecovering(true); try { await recover({ data: { action: "restructure", confirmation: "RESTRUCTURE" } }); setRestructure(false); setConfirmation(""); await qc.invalidateQueries(); toast.success("Company restructured — history retained"); } catch (e) { toast.error(e instanceof Error ? displayTerminology(e.message) : "Restructuring failed"); } finally { setRecovering(false); } }}>Confirm restructuring</Button></div></DialogContent></Dialog>
    </AppShell>
  );
}

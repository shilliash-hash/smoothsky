import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { aircraftTypesQuery, companyQuery, fleetQuery, ledgerQuery } from "@/lib/game";
import { MAX_LEASES, canAffordLease, formatCr, leaseUpfrontCost } from "@/lib/rules";
import { Button } from "@/components/ui/button";
import { AppShell } from "@/components/game/AppShell";

export const Route = createFileRoute("/_authenticated/market")({
  beforeLoad: async ({ context }) => {
    const c = await context.queryClient.fetchQuery(companyQuery);
    if (!c) throw redirect({ to: "/onboarding" });
  },
  head: () => ({ meta: [{ title: "Rynek leasingu — SmoothSky" }, { name: "description", content: "Leasing samolotów T1–T3." }] }),
  component: Market,
});

function Market() {
  const qc = useQueryClient();
  const { data: company } = useSuspenseQuery(companyQuery);
  const c = company!;
  const { data: types = [] } = useQuery(aircraftTypesQuery);
  const { data: ledger = [] } = useQuery(ledgerQuery(c.id));
  const { data: fleet = [] } = useQuery(fleetQuery(c.id));
  const [busy, setBusy] = useState<string | null>(null);
  const balance = ledger[0]?.balance_after ?? 0;
  const full = fleet.length >= MAX_LEASES;

  async function lease(id: string) {
    setBusy(id);
    const { error } = await supabase.rpc("lease_aircraft", { p_type: id });
    setBusy(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Samolot dołączył do floty w bazie domowej");
    qc.invalidateQueries({ queryKey: ["ledger"] });
    qc.invalidateQueries({ queryKey: ["fleet"] });
  }

  return (
    <AppShell company={c}>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="readout text-xs uppercase text-amber">Standard Dry Lease</p>
          <h1 className="mt-1 text-3xl font-semibold">Rynek leasingu</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Płacisz kaucję i pierwszą ratę z góry. Rata tygodniowa naliczana jest niezależnie od tego, czy samolot lata. Paliwo i obsługa po Twojej stronie.</p>
        </div>
        <div className="instrument px-4 py-3 text-right">
          <p className="text-xs uppercase text-muted-foreground">Dostępne środki</p>
          <p className="readout text-xl text-primary">{formatCr(balance)}</p>
        </div>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {types.map((t) => {
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
                <dt className="text-muted-foreground">Pasażerowie</dt><dd className="text-right">{t.pax}</dd>
                <dt className="text-muted-foreground">Cargo</dt><dd className="text-right">{t.cargo_kg} kg</dd>
                <dt className="text-muted-foreground">Zasięg</dt><dd className="text-right">{t.range_nm} NM</dd>
                <dt className="text-muted-foreground">Przelot</dt><dd className="text-right">{t.cruise_kts} kt</dd>
              </dl>
              <div className="readout mt-4 space-y-1 border-t border-border pt-4 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Kaucja</span><span>{formatCr(t.security_deposit)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Rata tygodniowa</span><span className="text-amber">{formatCr(t.weekly_rate)}</span></div>
                <div className="flex justify-between font-semibold"><span>Na start</span><span className="text-primary">{formatCr(leaseUpfrontCost(t))}</span></div>
              </div>
              <Button className="mt-5" disabled={!afford || full || busy !== null} onClick={() => lease(t.id)}>
                {full ? "Limit floty osiągnięty" : !afford ? "Brak środków" : busy === t.id ? "Podpisywanie…" : "Podpisz leasing"}
              </Button>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}

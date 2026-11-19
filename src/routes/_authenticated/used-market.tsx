import { createFileRoute, Link } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/game/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatCr } from "@/lib/rules";
import { getUsedMarket, usedMarketAction, type UsedListing } from "@/lib/used-market.functions";
import { askingPriceBand, depreciatedValue, pctVsNew } from "@/lib/used-market-rules";

const usedMarketQuery = (load: () => ReturnType<typeof getUsedMarket>) => queryOptions({ queryKey: ["used-market"], queryFn: () => load(), staleTime: 5000 });

export const Route = createFileRoute("/_authenticated/used-market")({
  loader: ({ context }) => context.queryClient.ensureQueryData(usedMarketQuery(() => getUsedMarket())),
  head: () => ({ meta: [{ title: "Used aircraft market — SmoothSky" }, { name: "description", content: "Buy pre-owned aircraft from brokers and other operators, priced by airframe hours." }, { property: "og:title", content: "Used aircraft market — SmoothSky" }, { property: "og:description", content: "Buy pre-owned aircraft from brokers and other operators, priced by airframe hours." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }] }),
  component: UsedMarket,
});

function UsedMarket() {
  const load = useServerFn(getUsedMarket);
  const act = useServerFn(usedMarketAction);
  const qc = useQueryClient();
  const { data } = useSuspenseQuery(usedMarketQuery(() => load()));
  const [busy, setBusy] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const rules = { depreciation_pct_per_100h: Number(data.rules.depreciation_pct_per_100h), depreciation_floor_pct: Number(data.rules.depreciation_floor_pct) };
  const broker = data.listings.filter(l => l.is_broker);
  const players = data.listings.filter(l => !l.is_broker);
  const listedIds = new Set(players.filter(l => l.is_mine).map(l => l.registration));

  async function run(key: string, ok: string, input: Parameters<typeof act>[0]["data"]) {
    setBusy(key);
    try { await act({ data: input }); await qc.invalidateQueries(); toast.success(ok); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Action failed"); }
    finally { setBusy(null); }
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="readout text-xs uppercase text-amber">Fleet acquisition · Pre-owned</p>
          <h1 className="mt-1 text-3xl font-semibold">Used aircraft market</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Value drops {rules.depreciation_pct_per_100h}% of list price per 100 airframe hours, never below {rules.depreciation_floor_pct}%. Aircraft stay at their current airport after purchase.</p>
        </div>
        <Button asChild variant="outline"><Link to="/market">New aircraft</Link></Button>
      </div>

      <Section title="Broker listings" subtitle="SmoothSky Aircraft Brokers · priced exactly at depreciated value">
        {broker.map(l => <ListingCard key={l.id} l={l} busy={busy === l.id} onBuy={() => run(l.id, `${l.registration} purchased`, { action: "buy", listing: l.id })} />)}
      </Section>
      <Section title="Player listings" subtitle="Offers from other operators · 75%–125% of depreciated value">
        {players.length === 0 && <p className="text-sm text-muted-foreground">No player offers right now.</p>}
        {players.map(l => <ListingCard key={l.id} l={l} busy={busy === l.id} onBuy={() => run(l.id, `${l.registration} purchased`, { action: "buy", listing: l.id })} onCancel={() => run(l.id, "Listing withdrawn", { action: "cancel", listing: l.id })} />)}
      </Section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Sell your aircraft</h2>
        <p className="text-sm text-muted-foreground">Only owned aircraft that are parked, with no active flight or reservation.</p>
        <div className="mt-4 grid gap-3">
          {data.owned.length === 0 && <p className="text-sm text-muted-foreground">You have no owned aircraft.</p>}
          {data.owned.filter(a => !listedIds.has(a.registration)).map(a => {
            const t = a.type as { manufacturer: string; model: string; tier: number; purchase_price: number } | null;
            if (!t) return null;
            const value = depreciatedValue(Number(t.purchase_price), Number(a.airframe_hours), rules);
            const band = askingPriceBand(value);
            const price = prices[a.id] ?? value;
            const valid = price >= band.min && price <= band.max;
            return (
              <div key={a.id} className="instrument flex flex-wrap items-center gap-4 p-4">
                <div className="min-w-48 flex-1">
                  <p className="readout font-semibold">{a.registration} <span className="text-muted-foreground">· {t.manufacturer} {t.model}</span></p>
                  <p className="readout text-xs text-muted-foreground">{a.location_icao} · {Number(a.airframe_hours).toFixed(1)} h · value {formatCr(value)} · {a.status}</p>
                </div>
                <label className="text-xs text-muted-foreground">Asking price ({formatCr(band.min)} – {formatCr(band.max)})
                  <Input aria-label={`Asking price for ${a.registration}`} type="number" step={1} min={band.min} max={band.max} value={price} onChange={e => setPrices({ ...prices, [a.id]: Number(e.target.value) })} className="mt-1 w-44" />
                </label>
                <Button disabled={!valid || a.status !== "AVAILABLE" || busy === a.id} onClick={() => run(a.id, `${a.registration} listed for sale`, { action: "list", aircraft: a.id, price })}>List for sale</Button>
              </div>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <section className="mt-8"><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{subtitle}</p><div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div></section>;
}

function ListingCard({ l, busy, onBuy, onCancel }: { l: UsedListing; busy: boolean; onBuy: () => void; onCancel?: () => void }) {
  const diff = pctVsNew(Number(l.asking_price), Number(l.catalog_price));
  return (
    <div className="instrument flex flex-col p-5">
      <div className="flex items-center justify-between">
        <span className="readout rounded-sm border border-amber/40 px-2 py-0.5 text-xs text-amber">T{l.tier}</span>
        <span className="readout text-xs text-muted-foreground">{l.is_broker ? "Broker" : l.seller_name}</span>
      </div>
      <h3 className="mt-3 text-xl font-semibold">{l.manufacturer} {l.model}</h3>
      <p className="readout text-sm text-primary">{l.registration}</p>
      <dl className="readout mt-4 grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Parked at</dt><dd className="truncate text-right" title={l.airport_name}>{l.location_icao}</dd>
        <dt className="text-muted-foreground">Airframe</dt><dd className="text-right">{Number(l.airframe_hours).toLocaleString("en-US", { maximumFractionDigits: 1 })} h</dd>
        <dt className="text-muted-foreground">New price</dt><dd className="text-right">{formatCr(l.catalog_price)}</dd>
        <dt className="text-muted-foreground">Asking</dt><dd className="text-right text-lg">{formatCr(l.asking_price)}</dd>
      </dl>
      <p className={`readout mt-2 text-right text-sm ${diff <= 0 ? "text-primary" : "text-destructive"}`}>{diff > 0 ? "+" : ""}{diff}% vs New</p>
      <div className="mt-auto pt-4">
        {l.is_mine
          ? <Button variant="outline" className="w-full" disabled={busy} onClick={onCancel}>Withdraw listing</Button>
          : <Button className="w-full" disabled={busy} onClick={onBuy}>{busy ? "Processing…" : "Buy Used"}</Button>}
      </div>
    </div>
  );
}

import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ResponsiveContainer, ComposedChart, Area, Line, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid } from "recharts";
import { companyResultsQuery } from "@/lib/fleet";
import { formatCr } from "@/lib/rules";

type Mode = "net" | "split" | "cash";
const modes: { id: Mode; label: string }[] = [{ id: "net", label: "Net P&L" }, { id: "split", label: "Rev vs Costs" }, { id: "cash", label: "Cash flow" }];

function HudTooltip({ active, payload }: { active?: boolean; payload?: { payload: { day: string; revenue: number; expenses: number; net: number; cash: number } }[] }) {
  if (!active || !payload?.length) return null;
  const r = payload[0]?.payload; if (!r) return null;
  const margin = r.revenue > 0 ? (r.net / r.revenue) * 100 : null;
  return <div className="instrument readout min-w-44 p-3 text-xs">
    <p className="text-amber">{r.day} UTC</p>
    <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
      <span className="text-muted-foreground">Revenue</span><span className="text-right text-primary">{formatCr(r.revenue)}</span>
      <span className="text-muted-foreground">Costs</span><span className="text-right text-amber">{formatCr(r.expenses)}</span>
      <span className="text-muted-foreground">Net</span><span className={`text-right ${r.net >= 0 ? "text-primary" : "text-destructive"}`}>{formatCr(r.net)}</span>
      <span className="text-muted-foreground">Cash flow</span><span className="text-right">{formatCr(r.cash)}</span>
      <span className="text-muted-foreground">Margin</span><span className="text-right">{margin === null ? "—" : `${margin.toFixed(1)}%`}</span>
    </div>
  </div>;
}

export function CompanyResults() {
  const { data } = useSuspenseQuery(companyResultsQuery);
  const [mode, setMode] = useState<Mode>("net");
  const rows = data.map(r => ({ day: String(r.day), net: Number(r.net), revenue: Number(r.revenue), expenses: Number(r.expenses), cash: Number(r.cash_flow) }));
  const net = rows.reduce((n, r) => n + r.net, 0);
  const revenue = rows.reduce((n, r) => n + r.revenue, 0);
  const margin = revenue > 0 ? (net / revenue) * 100 : null;
  const peak = rows.reduce<(typeof rows)[number] | null>((b, r) => (!b || r.net > b.net ? r : b), null);
  const key = mode === "cash" ? "cash" : "net";
  const shown = mode === "split" ? (["revenue", "expenses"] as const) : ([key] as const);
  const max = Math.max(0, ...rows.flatMap(r => shown.map(k => r[k])));
  const min = Math.min(0, ...rows.flatMap(r => shown.map(k => r[k])));
  const split = `${(max / (max - min || 1)) * 100}%`;
  return <section className="instrument min-w-0 p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-xs uppercase text-muted-foreground">Operating result · 30 days · UTC</h2>
      <div className="flex rounded-sm border border-border p-0.5" role="group" aria-label="Chart layer">
        {modes.map(m => <button key={m.id} type="button" onClick={() => setMode(m.id)} aria-pressed={mode === m.id} className={`readout rounded-sm px-2 py-0.5 text-[11px] ${mode === m.id ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>{m.label}</button>)}
      </div>
    </div>
    <dl className="readout mt-3 grid grid-cols-3 gap-3 text-xs">
      <div><dt className="text-muted-foreground">30d net</dt><dd className={`text-lg ${net >= 0 ? "text-primary" : "text-destructive"}`}>{formatCr(net)}</dd></div>
      <div><dt className="text-muted-foreground">Op. margin</dt><dd className="text-lg text-amber">{margin === null ? "—" : `${margin.toFixed(1)}%`}</dd></div>
      <div><dt className="text-muted-foreground">Peak day</dt><dd className="text-lg">{peak && peak.net > 0 ? formatCr(peak.net) : "—"}</dd><dd className="text-muted-foreground">{peak && peak.net > 0 ? peak.day.slice(5) : ""}</dd></div>
    </dl>
    <div className="mt-3 h-44 w-full" aria-label="Daily company results chart">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="cr-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.45} />
              <stop offset={split} stopColor="var(--primary)" stopOpacity={0.05} />
              <stop offset={split} stopColor="var(--destructive)" stopOpacity={0.05} />
              <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="cr-stroke" x1="0" y1="0" x2="0" y2="1">
              <stop offset={split} stopColor="var(--primary)" /><stop offset={split} stopColor="var(--destructive)" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis dataKey="day" tickFormatter={s => String(s).slice(5)} minTickGap={40} stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} />
          <YAxis width={55} stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} tickFormatter={v => formatCr(Number(v))} />
          <Tooltip content={<HudTooltip />} cursor={{ stroke: "var(--amber)", strokeDasharray: "3 3" }} />
          <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
          {mode === "split" && <Area type="monotone" dataKey="revenue" name="Revenue" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.12} strokeWidth={2} dot={false} isAnimationActive={false} />}
          {mode === "split" && <Line type="monotone" dataKey="expenses" name="Costs" stroke="var(--amber)" strokeWidth={2} dot={false} isAnimationActive={false} />}
          {mode !== "split" && <Area type="monotone" dataKey={key} stroke="url(#cr-stroke)" fill="url(#cr-fill)" strokeWidth={2} dot={false} activeDot={{ r: 3, fill: "var(--amber)" }} isAnimationActive={false} />}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  </section>;
}

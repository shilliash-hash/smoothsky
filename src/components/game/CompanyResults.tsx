import { useSuspenseQuery } from "@tanstack/react-query";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";
import { companyResultsQuery } from "@/lib/fleet";
import { formatCr } from "@/lib/rules";
export function CompanyResults() {
  const { data } = useSuspenseQuery(companyResultsQuery);
  const rows = data.map(r => ({ ...r, net: Number(r.net), revenue: Number(r.revenue), expenses: Number(r.expenses) }));
  const net = rows.reduce((n, r) => n + r.net, 0);
  return <section className="min-w-0 border-y border-border py-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-sm font-semibold">Daily operating result · 30 days · UTC</h2><span className={`readout ${net >= 0 ? "text-primary" : "text-destructive"}`}>{formatCr(net)}</span></div>
    <div className="mt-3 h-44 w-full" aria-label="Daily company profit and loss chart">
      <ResponsiveContainer width="100%" height="100%"><LineChart data={rows} margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
        <XAxis dataKey="day" tickFormatter={s => String(s).slice(5)} minTickGap={40} stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} />
        <YAxis width={55} stroke="var(--muted-foreground)" tick={{ fontSize: 10 }} />
        <Tooltip contentStyle={{ background: "var(--popover)", borderColor: "var(--border)", color: "var(--foreground)" }} formatter={v => formatCr(Number(v))} />
        <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
        <defs><linearGradient id="company-result-stroke" x1="0" y1="0" x2="0" y2="1"><stop offset={`${Math.max(0, Math.max(...rows.map(r=>r.net))) / (Math.max(0, Math.max(...rows.map(r=>r.net))) - Math.min(0, Math.min(...rows.map(r=>r.net))) || 1) * 100}%`} stopColor="var(--primary)" /><stop offset={`${Math.max(0, Math.max(...rows.map(r=>r.net))) / (Math.max(0, Math.max(...rows.map(r=>r.net))) - Math.min(0, Math.min(...rows.map(r=>r.net))) || 1) * 100}%`} stopColor="var(--destructive)" /></linearGradient></defs>
        <Line type="linear" dataKey="net" name="Net result" stroke="url(#company-result-stroke)" strokeWidth={2} dot={false} isAnimationActive={false} />
      </LineChart></ResponsiveContainer>
    </div>
    <div className="readout mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>Revenue {formatCr(rows.reduce((n,r)=>n+r.revenue,0))}</span><span>Operating costs + accrued lease {formatCr(rows.reduce((n,r)=>n+r.expenses,0))}</span><span>Cash flow {formatCr(data.reduce((n,r)=>n+Number(r.cash_flow),0))}</span></div>
  </section>;
}
import { ALL_TIERS, tierPresets, toggleTier } from "@/lib/airport-tiers";
export function TierPills({ tiers, onChange }: { tiers: number[]; onChange: (t: number[]) => void }) {
  const same = (p: readonly number[]) => p.length === tiers.length && p.every(t => tiers.includes(t));
  const pill = (on: boolean) => `readout rounded-full border px-2.5 py-1 text-xs transition-colors ${on ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`;
  return (
    <div role="group" aria-label="Airport tiers" className="flex flex-wrap items-center gap-1.5">
      <span className="readout mr-1 text-[10px] uppercase text-muted-foreground">Airport tiers</span>
      {tierPresets.map(p => <button key={p.label} type="button" aria-pressed={same(p.tiers)} className={pill(same(p.tiers))} onClick={() => onChange([...p.tiers])}>{p.label}</button>)}
      <span className="mx-1 h-4 w-px bg-border" />
      {ALL_TIERS.map(t => <button key={t} type="button" aria-pressed={tiers.includes(t)} className={pill(tiers.includes(t))} onClick={() => onChange(toggleTier(tiers, t))}>T{t}</button>)}
    </div>
  );
}

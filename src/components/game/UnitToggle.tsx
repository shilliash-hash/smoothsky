/** Compact segmented unit switch in the Flight Deck readout style. */
export function UnitToggle<T extends string>({ label, options, value, onChange }: { label: string; options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex overflow-hidden rounded-sm border border-border">
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={o === value} onClick={() => onChange(o)}
          className={`readout px-1.5 py-0.5 text-[10px] uppercase transition-colors ${o === value ? "bg-amber/20 text-amber" : "text-muted-foreground hover:text-foreground"}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

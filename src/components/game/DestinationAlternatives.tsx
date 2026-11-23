import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useDestinationAlternatives } from "@/lib/dispatch-deals";
import { formatCr } from "@/lib/rules";
import { displayTerminology } from "@/lib/display-terminology";

export function DestinationAlternatives({ aircraftId, originIcao, target, tiers, cargoKg, allCargo, rulesKey, selectedMargin, onSelect, passengers = null, targetFuel = null }: {
  aircraftId: string | undefined; originIcao: string | undefined; target: string;
  tiers: readonly number[]; cargoKg: number; allCargo: boolean; rulesKey: string;
  selectedMargin: number | null; onSelect: (icao: string) => void;
  passengers?: number | null; targetFuel?: number | null;
}) {
  const alternatives = useDestinationAlternatives(aircraftId, originIcao, target, tiers, cargoKg, allCargo, rulesKey, passengers, targetFuel);
  if (!target) return null;
  return <section aria-label="Destination alternatives" className="mt-6 border-t border-border pt-4">
    <h3 className="readout text-sm text-amber">Alternatives within 150 NM of {target}</h3>
    {alternatives.isPending && <p className="py-4 text-sm text-muted-foreground">Finding nearby alternatives…</p>}
    {alternatives.error && <p role="alert" className="py-4 text-sm text-destructive">Alternatives unavailable. Please try again.</p>}
    {!alternatives.isPending && !alternatives.error && !alternatives.data?.length && <p className="py-4 text-sm text-muted-foreground">No matching reachable alternatives.</p>}
    <div className="mt-2 divide-y divide-border">
      {(alternatives.data ?? []).map(a => {
        const difference = a.estimated_margin === null ? null : selectedMargin === null ? a.margin_diff_vs_target : a.estimated_margin - selectedMargin;
        return <Button key={a.icao} variant="ghost" onClick={() => onSelect(a.icao)} className="h-auto w-full justify-between gap-3 rounded-none py-3 text-left" aria-label={`Select alternative ${a.icao}`}>
          <span className="min-w-0 whitespace-normal">
            <span className="flex flex-wrap items-center gap-2"><span className="readout text-primary">{a.icao}</span><span aria-label={`Airport tier ${a.size}`} className={cn(badgeVariants({ variant: "outline" }), "readout shrink-0 rounded-sm border-border bg-muted px-1.5 py-0 text-[10px] leading-4 text-muted-foreground")}>T{a.size}</span><span className="readout text-primary">· {a.city || a.name}</span></span>
            <span className="mt-1 block text-xs text-muted-foreground">{Math.round(a.distance_from_target_nm)} NM from {target} · {Math.round(a.distance_nm)} NM route</span>
            {a.estimate_error && <span className="mt-1 block text-xs text-amber">{displayTerminology(a.estimate_error)}</span>}
          </span>
          <span className="readout shrink-0 text-right text-xs">
            <span className={`block ${a.estimated_margin !== null && a.estimated_margin >= 0 ? "text-primary" : "text-amber"}`}>{a.estimated_margin === null ? "Est. unavailable" : `Est. ${a.estimated_margin > 0 ? "+" : ""}${formatCr(a.estimated_margin)}`}</span>
            {difference !== null && <span className={`mt-1 block ${difference > 0 ? "text-primary" : "text-muted-foreground"}`}>{difference > 0 ? "+" : ""}{formatCr(difference)} vs selected</span>}
            <ArrowRight className="ml-auto mt-2 h-3 w-3" aria-hidden="true" />
          </span>
        </Button>;
      })}
    </div>
  </section>;
}
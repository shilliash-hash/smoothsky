import { useRef, useState, type ReactNode } from "react";
import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/** Amber (i) that reveals rule explanations on hover (desktop) or tap (touch). */
export function InfoHint({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hover = (next: boolean) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    if (next) setOpen(true); else closeTimer.current = setTimeout(() => setOpen(false), 120);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-amber transition-colors hover:bg-amber/15 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-amber"
          onPointerEnter={(e) => { if (e.pointerType === "mouse") hover(true); }} onPointerLeave={(e) => { if (e.pointerType === "mouse") hover(false); }}>
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-80 max-w-[90vw] space-y-2 border-amber/40 bg-panel p-3 text-xs leading-relaxed text-muted-foreground"
        onPointerEnter={(e) => { if (e.pointerType === "mouse") hover(true); }} onPointerLeave={(e) => { if (e.pointerType === "mouse") hover(false); }}
        onOpenAutoFocus={(e) => e.preventDefault()}>
        <p className="readout text-[10px] uppercase text-amber">{label}</p>
        {children}
      </PopoverContent>
    </Popover>
  );
}

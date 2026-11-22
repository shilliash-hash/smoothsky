import { cn } from "@/lib/utils";

export function FidsReadout({ value, className }: { value: string; className?: string }) {
  return <span aria-label={value} className={cn("fids-readout", className)}>
    <span aria-hidden="true" className="inline-flex gap-0.5">{Array.from(value).map((character, index) => <span key={index} className="fids-character">{character === " " ? "\u00a0" : character}</span>)}</span>
  </span>;
}
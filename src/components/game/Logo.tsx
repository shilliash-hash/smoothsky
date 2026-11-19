import { Link } from "@tanstack/react-router";

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <span className="grid h-8 w-8 place-items-center rounded-sm border border-primary/50 bg-primary/10 readout text-xs font-bold text-primary">
        SS
      </span>
      <span className="text-lg font-semibold tracking-tight">
        Smooth<span className="text-primary">Sky</span>
      </span>
    </Link>
  );
}

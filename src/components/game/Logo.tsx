import { Link } from "@tanstack/react-router";
import mark from "@/assets/smoothsky-mark.png.asset.json";

export function Logo({ to = "/" }: { to?: "/" | "/dashboard" }) {
  return (
    <Link to={to} className="flex items-center gap-2">
      <img src={mark.url} alt="" width={32} height={32} className="h-8 w-8 rounded-sm border border-primary/40 object-cover" />
      <span className="text-lg font-semibold">
        Smooth<span className="text-primary">Sky</span>
      </span>
    </Link>
  );
}

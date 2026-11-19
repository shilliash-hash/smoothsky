import { Link } from "@tanstack/react-router";

export function Logo({ to = "/" }: { to?: "/" | "/dashboard" }) {
  return (
    <Link to={to} className="text-2xl font-bold tracking-tight">
      <span className="text-foreground">Smooth</span><span className="text-primary">Sky</span>
    </Link>
  );
}

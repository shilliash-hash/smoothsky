import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getPilotProfile } from "@/lib/pilot.functions";
import { acarsOnline } from "@/lib/acars-status";
import { LogOut, Shield } from "lucide-react";
import { adminAccessQuery } from "@/lib/admin";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Logo } from "./Logo";
import { GameInfo } from "./GameInfo";
import { SupporterBadge } from "./SupporterBadge";

export function AppShell({
  children,
  company,
}: {
  children: ReactNode;
  company?: { icao_code: string; name: string; is_supporter?: boolean } | null;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: isAdmin } = useQuery(adminAccessQuery);
  const loadPilot = useServerFn(getPilotProfile);
  const { data: pilot } = useQuery({ queryKey: ["pilot-profile"], queryFn: () => loadPilot(), refetchInterval: 30_000 });
  const [now, setNow] = useState(0);
  useEffect(() => { setNow(Date.now()); const t = setInterval(() => setNow(Date.now()), 15_000); return () => clearInterval(t); }, []);
  const online = acarsOnline(pilot?.lastSeen, now);
  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-panel/70 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-3">
          <div className="flex flex-wrap items-center gap-3 sm:gap-6">
            <Logo />
            {company && (
              <nav className="flex flex-wrap gap-4 text-sm">
                <Link
                  to="/dashboard"
                  className="text-muted-foreground hover:text-foreground"
                  activeProps={{ className: "text-primary" }}
                >
                  Dashboard
                </Link>
                <Link
                  to="/market"
                  className="text-muted-foreground hover:text-foreground"
                  activeProps={{ className: "text-primary" }}
                >
                  Aircraft market
                </Link>
                <Link
                  to="/dispatch"
                  className="text-muted-foreground hover:text-foreground"
                  activeProps={{ className: "text-primary" }}
                >
                  Dispatch
                </Link>
                <Link
                  to="/radar"
                  className="text-muted-foreground hover:text-foreground"
                  activeProps={{ className: "text-primary" }}
                >
                  Radar
                </Link>
                <Link to="/bases" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-primary" }}>Bases</Link>
                <Link to="/logbook" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-primary" }}>Logbook</Link>
                <Link to="/leaderboard" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-primary" }}>Leaderboard</Link>
              </nav>
            )}
            {!company && (
              <nav className="flex flex-wrap gap-4 text-sm">
                <Link to="/profile" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-primary" }}>Profile</Link>
                <Link to="/leaderboard" className="text-muted-foreground hover:text-foreground" activeProps={{ className: "text-primary" }}>Leaderboard</Link>
              </nav>
            )}
          </div>
          <div className="flex items-center gap-3">
            <GameInfo />
            {company?.is_supporter && <SupporterBadge />}
            {isAdmin && (
              <Button asChild variant="ghost" size="sm">
                <Link to="/admin">
                  <Shield className="h-3.5 w-3.5" />
                  <span className="readout text-xs">ADMIN</span>
                </Link>
              </Button>
            )}
            <Link to="/profile" title={`Pilot profile · ACARS ${online ? "online" : "offline"}`} className="readout flex items-center gap-1.5 rounded-sm border border-amber/40 px-2 py-0.5 text-xs text-amber hover:bg-amber/10" activeProps={{ className: "bg-amber/10" }}>
              <span aria-label={online ? "ACARS online" : "ACARS offline"} className={`h-2 w-2 rounded-full ${online ? "animate-pulse bg-primary" : "bg-muted-foreground/50"}`} />
              {company?.icao_code ?? "PROFILE"}
            </Link>
            <Button variant="ghost" size="sm" onClick={signOut}>
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

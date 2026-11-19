import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { airportsQuery, companyQuery } from "@/lib/game";
import { STARTING_CAPITAL, formatCr, isValidCompanyCode, normalizeCompanyCode } from "@/lib/rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppShell } from "@/components/game/AppShell";

export const Route = createFileRoute("/_authenticated/onboarding")({
  beforeLoad: async ({ context }) => {
    const c = await context.queryClient.fetchQuery(companyQuery);
    if (c) throw redirect({ to: "/dashboard" });
  },
  head: () => ({ meta: [{ title: "Załóż linię lotniczą — SmoothSky" }, { name: "description", content: "Kreator nowej linii lotniczej." }] }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: airports = [] } = useQuery(airportsQuery);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [available, setAvailable] = useState<boolean | null>(null);
  const [search, setSearch] = useState("");
  const [home, setHome] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setAvailable(null);
    if (!isValidCompanyCode(code)) return;
    const t = setTimeout(async () => {
      const { data } = await supabase.rpc("is_company_code_available", { p_code: normalizeCompanyCode(code) });
      setAvailable(!!data);
    }, 300);
    return () => clearTimeout(t);
  }, [code]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? airports.filter((a) => [a.icao, a.iata, a.name, a.city, a.country].some((v) => v?.toLowerCase().includes(q))) : airports;
    return list.slice(0, 40);
  }, [airports, search]);
  const homeAirport = airports.find((a) => a.icao === home);
  const ready = name.trim().length >= 3 && isValidCompanyCode(code) && available && home;

  async function submit() {
    if (!ready) return;
    setBusy(true);
    const { error } = await supabase.rpc("create_company", { p_name: name.trim(), p_icao_code: normalizeCompanyCode(code), p_home_base: home! });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries();
    toast.success(`Linia założona. Na koncie ${formatCr(STARTING_CAPITAL)}.`);
    navigate({ to: "/dashboard" });
  }

  return (
    <AppShell>
      <p className="readout text-xs uppercase text-amber">Pre-flight · Rejestracja przewoźnika</p>
      <h1 className="mt-2 text-3xl font-semibold">Załóż swoją linię lotniczą</h1>
      <p className="mt-2 text-muted-foreground">Na start otrzymasz kapitał {formatCr(STARTING_CAPITAL)}. Wydawaj go rozważnie.</p>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="instrument space-y-5 p-6">
          <div className="space-y-2">
            <Label htmlFor="name">Nazwa linii</Label>
            <Input id="name" maxLength={60} placeholder="np. SmoothSky Regional" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="code">Kod ICAO firmy (3 litery)</Label>
            <div className="flex items-center gap-3">
              <Input id="code" maxLength={3} className="readout w-28 text-lg uppercase" placeholder="SSO" value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase())} />
              {isValidCompanyCode(code) && available === true && <span className="flex items-center gap-1 text-sm text-success"><Check className="h-4 w-4" /> Wolny</span>}
              {available === false && <span className="flex items-center gap-1 text-sm text-destructive"><X className="h-4 w-4" /> Zajęty</span>}
            </div>
          </div>
          <div className="rounded-sm border border-border p-4">
            <p className="readout text-xs uppercase text-muted-foreground">Baza domowa</p>
            {homeAirport ? (
              <p className="mt-1"><span className="readout text-primary">{homeAirport.icao}</span> · {homeAirport.name}, {homeAirport.city}</p>
            ) : <p className="mt-1 text-sm text-muted-foreground">Wybierz lotnisko z listy.</p>}
          </div>
          <Button className="w-full" size="lg" disabled={!ready || busy} onClick={submit}>Zarejestruj linię</Button>
        </div>
        <div className="instrument flex flex-col p-6">
          <Label htmlFor="apt">Szukaj lotniska (ICAO, miasto, kraj)</Label>
          <Input id="apt" className="mt-2" placeholder="EPWA, Kraków, Norway…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <ul className="mt-3 max-h-96 flex-1 overflow-y-auto">
            {filtered.map((a) => (
              <li key={a.icao}>
                <button type="button" onClick={() => setHome(a.icao)} className={`flex w-full items-center gap-3 rounded-sm px-2 py-2 text-left text-sm hover:bg-accent ${home === a.icao ? "bg-accent text-primary" : ""}`}>
                  <span className="readout w-12 text-primary">{a.icao}</span>
                  <span className="flex-1 truncate">{a.name}</span>
                  <span className="text-xs text-muted-foreground">{a.city}, {a.country}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </AppShell>
  );
}

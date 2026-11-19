import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { accountHome } from "@/lib/account-home";
import { getWorldTelemetry } from "@/lib/world.functions";
import { Landmark, Users, Package, Radio, MapPin, Building2, UserRound, PlaneLanding, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/game/Logo";

export const Route = createFileRoute("/")({
  loader: async () => ({ telemetry: await getWorldTelemetry().catch(() => null) }),
  head: () => ({
    meta: [
      { title: "SmoothSky · Persistent Aviation World" },
      { name: "description", content: "A persistent aviation world: run an airline or fly as a pilot, move passengers, cargo and MEDEVAC missions, with SimBrief and live ACARS." },
      { property: "og:title", content: "SmoothSky · Persistent Aviation World" },
      { property: "og:description", content: "Realistic economics, two career paths, cargo and urgent missions, SimBrief and live ACARS across thousands of airports." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const pillars = [
  { icon: Landmark, title: "Realistic economics", points: ["1 SC ≈ 1 EUR/USD — every coin goes through a double-entry ledger", "Airport fuel refills 10%/h, passenger pools 1%/h", "Stepped charter bonuses reward small GA aircraft on thin routes", "Leases, purchases, FOB bases and weekly obligations"] },
  { icon: Users, title: "Two career paths", points: ["Airline Owner: lease or buy aircraft, open bases, hire pilots", "Pilot: fly on a Roster contract or as a Freelancer for commission", "Earn Type Ratings to unlock bigger tiers", "Buy airline stakes for weekly dividends or a personal aircraft"] },
  { icon: Package, title: "Cargo & urgent missions", points: ["Belly cargo alongside passengers or All-Cargo with +50% capacity", "Cargo pools regenerate hourly — even at small regional fields", "MEDEVAC / transplant runs with fees waived and 2–3 h deadlines", "AOG industrial freight — late delivery halves the payout"] },
  { icon: Radio, title: "SimBrief + Live ACARS", points: ["Import your SimBrief OFP straight into Dispatch", "Personal ACARS key streams live position to the radar", "PIREPs are validated against physics and fuel plausibility", "No simulator yet? Use the accelerated web test flight"] },
];

const steps = [
  "Create an account and choose your career.",
  "Pick a home base and your first aircraft (or join an airline's roster).",
  "Dispatch passengers, cargo or a special mission and watch it on the radar.",
  "Settle the flight, grow your fleet and climb the leaderboard.",
];

function Index() {
  const { telemetry } = Route.useLoaderData();
  const navigate = useNavigate();
  const [entryError, setEntryError] = useState(false);
  useEffect(() => {
    let active = true;
    async function enterAccount() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) return;
        const to = await accountHome(data.session.user.id);
        if (active) await navigate({ to, replace: true });
      } catch {
        if (active) setEntryError(true);
      }
    }
    void enterAccount();
    return () => { active = false; };
  }, [navigate]);
  const fmt = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString("en-US"));
  const stats = [
    { icon: MapPin, label: "Active airports", value: fmt(telemetry?.airports) },
    { icon: Building2, label: "Airlines", value: fmt(telemetry?.airlines) },
    { icon: UserRound, label: "Registered pilots", value: fmt(telemetry?.pilots) },
    { icon: PlaneLanding, label: "Flights completed", value: fmt(telemetry?.flights) },
  ];
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <Button asChild variant="outline"><Link to="/auth">Sign in</Link></Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24">
        {entryError && <p role="alert" className="mb-4 text-destructive">Unable to open your account. Please try signing in again.</p>}
        <section className="pt-12 md:pt-20">
          <p className="readout text-xs uppercase text-amber">● Persistent Aviation World</p>
          <h1 className="mt-4 max-w-4xl text-5xl font-semibold leading-tight md:text-7xl">
            Smooth<span className="text-primary">Sky</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            One shared sky for virtual airlines and pilots. Build a company or a flying career, move passengers and urgent freight, and keep every Smooth Coin accountable.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link to="/auth">Start flying</Link></Button>
            <Button asChild size="lg" variant="outline"><a href="#how-it-works">How SmoothSky works</a></Button>
          </div>
        </section>

        <section aria-label="Live world telemetry" className="mt-16 border-y border-border py-5">
          <p className="readout mb-4 text-xs uppercase text-amber">Live world telemetry</p>
          <dl className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <s.icon className="h-5 w-5 shrink-0 text-primary" />
                <div>
                  <dd className="readout text-2xl md:text-3xl">{s.value}</dd>
                  <dt className="text-xs uppercase text-muted-foreground">{s.label}</dt>
                </div>
              </div>
            ))}
          </dl>
        </section>

        <section id="how-it-works" className="mt-20 scroll-mt-8">
          <p className="readout text-xs uppercase text-amber">Flight manual</p>
          <h2 className="mt-2 text-3xl font-semibold">How SmoothSky works</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {pillars.map((p) => (
              <article key={p.title} className="instrument p-6">
                <p.icon className="h-5 w-5 text-primary" />
                <h3 className="mt-4 text-lg font-semibold">{p.title}</h3>
                <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
                  {p.points.map((x) => <li key={x} className="flex gap-2"><span className="text-amber">›</span>{x}</li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-20 grid gap-10 md:grid-cols-[1fr_1fr]">
          <div>
            <p className="readout text-xs uppercase text-amber">Checklist</p>
            <h2 className="mt-2 text-3xl font-semibold">Your first flight</h2>
            <ol className="mt-6 space-y-4">
              {steps.map((s, i) => (
                <li key={s} className="flex gap-4">
                  <span className="readout flex h-8 w-8 shrink-0 items-center justify-center rounded-sm border border-primary/50 text-primary">{i + 1}</span>
                  <span className="pt-1 text-muted-foreground">{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="instrument flex flex-col justify-between p-6">
            <div>
              <HeartPulse className="h-6 w-6 text-destructive" />
              <h3 className="mt-4 text-xl font-semibold">Urgent contracts never stop</h3>
              <p className="mt-2 text-sm text-muted-foreground">Twelve special missions are always live somewhere in the network. Accept one, beat the clock and collect the fixed payout.</p>
            </div>
            <Button asChild className="mt-6 self-start"><Link to="/auth">Create your account</Link></Button>
          </div>
        </section>
      </main>
    </div>
  );
}

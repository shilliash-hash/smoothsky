import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { accountHome } from "@/lib/account-home";
import { getWorldTelemetry } from "@/lib/world.functions";
import { Landmark, Users, Package, Radio, MapPin, Building2, UserRound, PlaneLanding, HeartPulse } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/game/Logo";
import { FidsReadout } from "@/components/game/FidsReadout";
import apron from "@/assets/flight-deck-apron.webp.asset.json";

const DISCORD_URL = "https://discord.gg/Ptepd4dVNF";

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
      <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.058a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03ZM8.02 15.331c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418Zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418Z" />
    </svg>
  );
}

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
  { icon: Landmark, title: "Realistic economics", points: ["1 SC = 1 EUR/USD — every coin goes through a double-entry ledger", "Hub & Feeder passenger demand rewards flying traffic into major hubs", "Pay-As-You-Burn fuel settled from actual ACARS consumption", "Leases, purchases, FBO bases and weekly obligations", "SmoothSky rule of thumb - 3 flights a week for leased plane - guarantee of profit"] },
  { icon: Users, title: "Two career paths", points: ["Airline Owner: lease or buy aircraft, open bases, hire pilots", "Pilot: fly on a Roster contract or as a Freelancer for commission", "Fly Tier 1–3 aircraft from Day 1 with zero-commitment Spot Rentals", "Buy airline stakes for weekly dividends or a personal aircraft"] },
  { icon: Package, title: "Cargo & urgent missions", points: ["Belly cargo alongside passengers or All-Cargo with +50% capacity", "Cargo and PAX pools regenerate dynamically — even at small regional fields", "MEDEVAC / transplant runs with fees waived and 2–3 h deadlines", "AOG industrial freight — late delivery halves the payout"] },
  { icon: Radio, title: "SimBrief + Live ACARS", points: ["Optional SimBrief OFP route & fuel import — or dispatch in 2 clicks without external tools", "Dedicated desktop ACARS client for MSFS 2020/2024 & X-Plane 11/12", "Personal ACARS key streams live position to the radar", "PIREPs are validated against flight physics and strict anti-refuel telemetry"] },
];

const steps = [
  "3 Clicks & Fly — zero spreadsheet headache: pick a route from Best Deals, hit Auto-load best mix, and dispatch in 5 seconds (deep MTOW, fuel tankering, and SimBrief tools are always optional).",
  "Fly Tier 1–3 aircraft from Day 1 with single-flight Spot Rentals — zero deposits or weekly pressure.",
  "Not a '2nd job': weekly leases pay for themselves in 3–4 normal flights, with 75% deposit refund on early exit.",
  "Built-in safety net: reset debt and get a fresh starter grant once every 30 days without losing your logbook.",
  "Dispatch passengers or cargo, fly in MSFS or X-Plane with live ACARS, and climb the leaderboard.",
];



function Index() {
  const { telemetry } = Route.useLoaderData();
  const [entryError, setEntryError] = useState(false);
  const [home, setHome] = useState<"/dashboard" | "/profile" | "/onboarding" | null>(null);
  useEffect(() => {
    let active = true;
    async function enterAccount() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (!data.session) return;
        const to = await accountHome(data.session.user.id);
        if (active) setHome(to);
      } catch {
        if (active) setEntryError(true);
      }
    }
    void enterAccount();
    return () => { active = false; };
  }, []);
  const fmt = (n: number | undefined) => (n === undefined ? "—" : n.toLocaleString("en-US"));
  const stats = [
    { icon: MapPin, label: "Active airports", value: fmt(telemetry?.airports) },
    { icon: Building2, label: "Airlines", value: fmt(telemetry?.airlines) },
    { icon: UserRound, label: "Registered pilots", value: fmt(telemetry?.pilots) },
    { icon: PlaneLanding, label: "Flights completed", value: fmt(telemetry?.flights) },
  ];
  return (
    <div className="deck-surface min-h-screen">
      <header className="border-b border-border bg-panel">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" aria-label="Join the SmoothSky Discord server">
              <DiscordIcon className="h-4 w-4" /><span className="hidden sm:inline">Discord</span>
            </a>
          </Button>
          <Button asChild variant="outline" size="sm"><Link to={home ?? "/auth"}>{home ? "Open Flight Deck" : "Sign in"}</Link></Button>
        </div>
      </div>
      </header>
      <main className="pb-24">
        {entryError && <p role="alert" className="mb-4 text-destructive">Unable to open your account. Please try signing in again.</p>}
        <section className="world-hero">
          <img src="/landing-hero.png" alt="" aria-hidden="true" width={1472} height={841} fetchPriority="high" className="world-hero-image" />
          <div className="mx-auto max-w-6xl px-6 pb-16 pt-14 md:pb-20 md:pt-20">
          <p className="readout flex items-center gap-2 text-xs uppercase text-amber"><span className="h-1.5 w-1.5 rounded-full bg-primary" />Global operations terminal</p>
          <h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-tight md:text-7xl">
            Smooth<span className="text-primary">Sky</span>
          </h1>
          <p className="mt-6 max-w-lg text-lg text-foreground">
            One shared sky for virtual airlines and pilots. Build a company or a flying career, move passengers and urgent freight, and keep every Smooth Coin accountable.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg"><Link to={home ?? "/auth"}>Enter Flight Deck</Link></Button>
            <Button asChild size="lg" variant="outline"><a href="#how-it-works">How SmoothSky works</a></Button>
          </div>
          </div>
        </section>

        <section aria-label="Live world telemetry" className="border-y border-border bg-panel py-6">
          <div className="mx-auto max-w-6xl px-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2"><p className="readout text-xs uppercase text-amber">World traffic board</p><span className="readout text-[10px] uppercase text-muted-foreground">Persistent aviation world</span></div>
          <dl className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <s.icon className="h-5 w-5 shrink-0 text-primary" />
                <div>
                  <dd className="text-lg text-primary md:text-2xl"><FidsReadout value={s.value} /></dd>
                  <dt className="mt-2 text-[10px] uppercase text-muted-foreground">{s.label}</dt>
                </div>
              </div>
            ))}
          </dl>
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-6">
        <section id="how-it-works" className="mt-12 scroll-mt-8">
          <p className="readout text-xs uppercase text-amber">Flight manual</p>
          <h2 className="mt-2 text-3xl font-semibold">How SmoothSky works</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {pillars.map((p) => (
              <article key={p.title} className="instrument p-6">
                <div className="flex items-center justify-between border-b border-border pb-4"><p.icon className="h-5 w-5 text-primary" /><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber" /></div>
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
            <Button asChild className="mt-6 self-start"><Link to="/leaderboard">View Live Leaderboard</Link></Button>
          </div>
        </section>
        <footer className="readout mt-16 flex flex-wrap justify-between gap-3 border-t border-border pt-5 text-xs text-muted-foreground"><span>SmoothSky · Persistent Aviation World</span><a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:text-amber"><DiscordIcon className="h-3.5 w-3.5" />Discord Community ↗</a><span>Company · Career · Flight</span></footer>
        </div>
      </main>
    </div>
  );
}

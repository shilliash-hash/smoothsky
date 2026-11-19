import { createFileRoute, Link } from "@tanstack/react-router";
import { Plane, Landmark, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/game/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SmoothSky — Build your airline" },
      { name: "description", content: "An independent aviation business simulation: aircraft leasing, financial ledger and a global airport network." },
      { property: "og:title", content: "SmoothSky — Build your airline" },
      { property: "og:description", content: "Aircraft leasing, a financial ledger and a global airport network for virtual pilots." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  { icon: Landmark, title: "Real economics", text: "Every credit goes through a double-entry ledger. A flight is not automatically profitable." },
  { icon: Plane, title: "Aircraft leasing", text: "Start with a Cessna 172 or take a chance on a King Air. Deposits and weekly payments count, even when you are not flying." },
  { icon: Radar, title: "Global network", text: "Shared airports from Lukla to Heathrow. Nobody owns them — every airline can use them." },
];

function Index() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <Button asChild variant="outline"><Link to="/auth">Sign in</Link></Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        <p className="readout text-xs uppercase text-amber">● Phase 1 · Ground operations</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-tight md:text-6xl">
          Smooth<span className="text-primary">Sky</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          Build your airline, choose a home base, lease your first aircraft and keep your cash flow under control.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg"><Link to="/auth">Create your airline</Link></Button>
        </div>
        <div className="mt-20 grid gap-4 md:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="instrument p-6">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

import { createFileRoute, Link } from "@tanstack/react-router";
import { Plane, Landmark, Radar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/game/Logo";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SmoothSky — Zbuduj własną linię lotniczą" },
      { name: "description", content: "Niezależna platforma biznesu lotniczego dla symulatorów lotu: leasing maszyn, księga finansowa, globalna sieć lotnisk." },
      { property: "og:title", content: "SmoothSky — Zbuduj własną linię lotniczą" },
      { property: "og:description", content: "Leasing maszyn, księga finansowa i globalna sieć lotnisk dla pilotów wirtualnych." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  { icon: Landmark, title: "Twarda ekonomia", text: "Każdy kredyt przechodzi przez księgę z podwójnym zapisem. Lot nie jest automatycznie zyskowny." },
  { icon: Plane, title: "Leasing floty", text: "Zacznij od Cessny 172 albo zaryzykuj King Aira. Kaucja i tygodniowa rata płyną niezależnie od lotów." },
  { icon: Radar, title: "Globalna sieć", text: "Lotniska systemowe od Lukli po Heathrow. Nikt ich nie kupi — wszyscy z nich korzystają." },
];

function Index() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Logo />
        <Button asChild variant="outline"><Link to="/auth">Zaloguj się</Link></Button>
      </header>
      <main className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        <p className="readout text-xs uppercase text-amber">● Faza 1 · Operacje naziemne</p>
        <h1 className="mt-4 max-w-3xl text-5xl font-semibold leading-tight tracking-tight md:text-6xl">
          Zysk trzeba <span className="text-primary">wylatać</span>, nie kliknąć.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
          SmoothSky to niezależna platforma biznesu lotniczego. Załóż linię, wybierz bazę, wyleasinguj pierwszą maszynę i pilnuj płynności.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg"><Link to="/auth">Załóż linię lotniczą</Link></Button>
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

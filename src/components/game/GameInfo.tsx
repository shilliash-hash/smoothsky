import { Info, Heart, Coins, Plane, Fuel, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const rules = [
  { icon: Coins, title: "Smooth Coins", text: "1 SC ≈ 1 EUR/USD: a realistic pricing scale for fuel, airport fees and aircraft, not a redeemable currency." },
  { icon: Plane, title: "Your fleet", text: "Leasing requires a refundable deposit and a weekly payment for the contract term. Owned aircraft have no lease payments and allow a custom, unique registration following the home-base country's rules." },
  { icon: Fuel, title: "Passengers & fuel", text: "Passenger pools naturally regenerate at 1% of capacity per hour, up to 95%. Both 100LL and Jet-A1 tanks refill at 10% of capacity per hour, up to full." },
  { icon: MapPin, title: "FOB bases", text: "Operate 1 Main and up to 2 Satellite FOBs. Fuel contracts, handling desks and maintenance bays reduce the matching operating costs at supported airports." },
];
export function GameInfo() {
  return <Dialog><DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="SmoothSky rules" title="SmoothSky rules"><Info className="h-4 w-4" /></Button></DialogTrigger>
    <DialogContent className="max-h-[85dvh] max-w-xl overflow-y-auto">
      <DialogTitle className="pr-6 text-xl">SmoothSky Rules</DialogTitle>
      <DialogDescription>Flight Deck · The essentials</DialogDescription>
      <div className="divide-y divide-border">{rules.map(rule => <section key={rule.title} className="flex gap-4 py-4"><rule.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><h2 className="font-semibold">{rule.title}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{rule.text}</p></div></section>)}</div>
      <div className="border-t border-border pt-3"><Button variant="ghost" size="sm" disabled title="Donation link pending"><Heart className="h-3.5 w-3.5" />Support SmoothSky (Donate)</Button></div>
    </DialogContent>
  </Dialog>;
}
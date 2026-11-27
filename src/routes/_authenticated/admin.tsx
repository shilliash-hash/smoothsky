import { displayTerminology } from "@/lib/display-terminology";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Save, Shield, X, RotateCcw, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/game/AppShell";
import { SupporterBadge } from "@/components/game/SupporterBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { adminAccessQuery, adminDataQuery } from "@/lib/admin";
import { saveAdminData, resetAirports, resetAdminCompany, deleteAdminAccount } from "@/lib/admin.functions";
import { companyQuery } from "@/lib/game";
import { formatCr } from "@/lib/rules";
import { routeSaturationFields, specialMissionFields, type AircraftEdit } from "@/lib/admin-rules";
import { recruitmentSettings } from "@/lib/recruitment-rules";
import { fleetOverviewQuery } from "@/lib/fleet";
import { saveOperatingRules } from "@/lib/fleet.functions";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/admin")({
  loader: async ({ context }) => {
    if (!(await context.queryClient.ensureQueryData(adminAccessQuery)))
      throw redirect({ to: "/dashboard" });
    await Promise.all([
      context.queryClient.ensureQueryData(adminDataQuery),
      context.queryClient.ensureQueryData(companyQuery),
      context.queryClient.ensureQueryData(fleetOverviewQuery),
    ]);
  },
  head: () => ({
    meta: [
      { title: "Administration — SmoothSky" },
      {
        name: "description",
        content: "SmoothSky administration: economy, aircraft catalogue and company oversight.",
      },
      { property: "og:title", content: "Administration — SmoothSky" },
      { property: "og:description", content: "SmoothSky Flight Deck administration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});
const freshAircraft: AircraftEdit = {
  id: "",
  tier: 1,
  manufacturer: "",
  model: "",
  pax: 3,
  cargo_kg: 0,
  range_nm: 500,
  cruise_kts: 120,
  engine: "Piston",
  security_deposit: 5000,
  weekly_rate: 1500,
  purchase_price: 50000,
  fuel_type: "100LL",
  fuel_burn_gph: 9,
  fuel_capacity_gal: 56,
  minimum_runway_ft: 1500,
  active: true,
  unpaved_capable: false,
  empty_weight_kg: 800,
  mtow_kg: 1150,
};
function Admin() {
  const { data } = useSuspenseQuery(adminDataQuery);
  const { data: company } = useSuspenseQuery(companyQuery);
  const qc = useQueryClient();
  const save = useServerFn(saveAdminData);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<AircraftEdit | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const reset = useServerFn(resetAirports);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirmation, setResetConfirmation] = useState("");
  const resetCompany = useServerFn(resetAdminCompany);
  const deleteAccount = useServerFn(deleteAdminAccount);
  const [playerAction, setPlayerAction] = useState<{ kind: "reset" | "delete"; player: (typeof data.users)[number] } | null>(null);
  const [playerConfirmation, setPlayerConfirmation] = useState("");
  const startingCapital = Number(data.economy.find(row => row.key === "starting_capital")?.value ?? 0);
  async function confirmPlayerAction() {
    if (!playerAction || busy) return;
    setBusy(true);
    try {
      if (playerAction.kind === "reset") {
        if (!playerAction.player.company_id) throw new Error("Company not found");
        await resetCompany({ data: { companyId: playerAction.player.company_id, confirmation: "RESET" } });
        toast.success("Company reset to a fresh start");
      } else {
        await deleteAccount({ data: { userId: playerAction.player.user_id, confirmation: "DELETE" } });
        toast.success("Player account permanently deleted");
      }
      setPlayerAction(null);
      setPlayerConfirmation("");
    } catch (error) {
      toast.error(error instanceof Error ? displayTerminology(error.message) : "Action failed");
    } finally {
      await qc.invalidateQueries();
      setBusy(false);
    }
  }
  async function persist(payload: Parameters<typeof save>[0]) {
    setBusy(true);
    try {
      await save(payload);
      await qc.invalidateQueries();
      toast.success("Changes saved");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? displayTerminology(e.message) : "Save failed");
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppShell company={company}>
      <div className="flex items-center gap-3">
        <Shield className="h-7 w-7 text-amber" />
        <div>
          <p className="readout text-xs uppercase text-amber">Flight Deck · Administration</p>
          <h1 className="text-3xl font-semibold">System control</h1>
        </div>
      </div>
      <Tabs defaultValue="economy" className="mt-6">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="economy">Economy</TabsTrigger>
          <TabsTrigger value="fleet">Fleet & leasing</TabsTrigger>
          <TabsTrigger value="users">Users & companies</TabsTrigger>
        </TabsList>
        <TabsContent value="economy" className="mt-6">
          <OperatingRulesEditor />
          <h2 className="mt-8 border-b border-border pb-3 text-xl font-semibold">Corridor saturation &amp; feeder credit</h2>
          <div className="divide-y divide-border">
            {data.economy.filter(row => routeSaturationFields[row.key]).map(row => <EconomyRow
              key={`${row.key}:${JSON.stringify(row.value)}`}
              row={row}
              busy={busy}
              onSave={value => persist({ data: { kind: "economy", key: row.key, value } })}
            />)}
          </div>
          <div className="divide-y divide-border">
            {data.economy.filter(row => !routeSaturationFields[row.key]).map((row) => (
              row.key === "recruitment_commissions" ? <RecruitmentEditor key={JSON.stringify(row.value)} value={row.value} busy={busy} onSave={value => persist({ data: { kind: "economy", key: row.key, value } })} /> : <EconomyRow
                key={`${row.key}:${JSON.stringify(row.value)}`}
                row={row}
                busy={busy}
                onSave={(value) => persist({ data: { kind: "economy", key: row.key, value } })}
              />
            ))}
          </div>
          <h2 className="mt-8 border-b border-border pb-3 text-xl font-semibold">
            Airport fuel supply
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="py-3">Size / Fuel</th>
                  <th>Capacity (gal)</th>
                  <th>Development gain</th>
                  <th>Refill / hour</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.fuel.map((rule) => (
                  <FuelRow
                    key={JSON.stringify(rule)}
                    rule={rule}
                    busy={busy}
                    onSave={(rule) => persist({ data: { kind: "fuel", rule } })}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <section className="mt-8 border-y border-border py-5"><h2 className="text-xl font-semibold">World supplies</h2><p className="mt-2 text-sm text-muted-foreground">Restore every airport to the configured initial passenger stock and full simulated fuel capacity. Active flights must be completed or cancelled first.</p><Button variant="destructive" className="mt-4" disabled={busy} onClick={() => setResetOpen(true)}>Reset airports (Passengers & Fuel)</Button></section>
          <Dialog open={resetOpen} onOpenChange={open => { if (!busy) setResetOpen(open); }}><DialogContent><DialogTitle>Reset world airport supplies?</DialogTitle><DialogDescription>This affects all players. Passenger pools return to the configured starting level; both fuel types return to full capacity. Airport data, companies, flights and financial histories remain unchanged.</DialogDescription><label className="text-sm">Type RESET AIRPORTS to confirm<Input aria-label="Airport reset confirmation" className="mt-2" value={resetConfirmation} onChange={e => setResetConfirmation(e.target.value)} /></label><div className="flex justify-end gap-3"><Button variant="outline" disabled={busy} onClick={() => setResetOpen(false)}>Cancel</Button><Button variant="destructive" disabled={busy || resetConfirmation !== "RESET AIRPORTS"} onClick={async () => { setBusy(true); try { await reset({ data: { confirmation: "RESET AIRPORTS" } }); setResetOpen(false); setResetConfirmation(""); await qc.invalidateQueries(); toast.success("Airport passenger and fuel supplies reset"); } catch (e) { toast.error(e instanceof Error ? displayTerminology(e.message) : "Reset failed"); } finally { setBusy(false); } }}>Confirm airport reset</Button></div></DialogContent></Dialog>
        </TabsContent>
        <TabsContent value="fleet" className="mt-6">
          <div className="flex justify-between gap-3">
            <h2 className="text-xl font-semibold">Aircraft catalogue</h2>
            <Button
              onClick={() => {
                setEditing({ ...freshAircraft });
                setCreating(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Add aircraft
            </Button>
          </div>
          {editing && (
            <form
              className="my-5 border-y border-border py-5"
              onSubmit={async (e) => {
                e.preventDefault();
                if (
                  await persist({ data: { kind: "aircraft", create: creating, aircraft: editing } })
                )
                  setEditing(null);
              }}
            >
              <div className="mb-4 flex justify-between">
                <h3 className="text-lg">{creating ? "New aircraft" : editing.model}</h3>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Close aircraft editor"
                  onClick={() => setEditing(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {(
                  [
                    ["id", "Model code"],
                    ["manufacturer", "Manufacturer"],
                    ["model", "Model"],
                    ["engine", "Engine"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="text-sm">
                    {label}
                    <Input
                      aria-label={label}
                      className="mt-1"
                      required
                      value={editing[key]}
                      disabled={key === "id" && !creating}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          [key]: key === "id" ? e.target.value.toUpperCase() : e.target.value,
                        })
                      }
                    />
                  </label>
                ))}
                {(
                  [
                    ["tier", "Tier"],
                    ["pax", "Seats"],
                    ["cargo_kg", "Cargo (kg)"],
                    ["range_nm", "Range (NM)"],
                    ["cruise_kts", "Cruise (kt)"],
                    ["security_deposit", "Deposit (SC)"],
                    ["weekly_rate", "Weekly lease (SC)"],
                    ["purchase_price", "Purchase price (SC)"],
                    ["fuel_burn_gph", "Fuel burn (gal/h)"],
                    ["fuel_capacity_gal", "Fuel capacity (gal)"],
                    ["minimum_runway_ft", "Minimum runway (ft)"],
                    ["empty_weight_kg", "Empty weight · OEW (kg)"],
                    ["mtow_kg", "MTOW (kg)"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="text-sm">
                    {label}
                    <Input
                      aria-label={label}
                      className="mt-1"
                      type="number"
                      min="0"
                      step={
                        [
                          "security_deposit",
                          "weekly_rate",
                          "purchase_price",
                          "fuel_burn_gph",
                          "fuel_capacity_gal",
                        ].includes(key)
                          ? "0.1"
                          : "1"
                      }
                      required
                      value={editing[key]}
                      onChange={(e) => setEditing({ ...editing, [key]: Number(e.target.value) })}
                    />
                  </label>
                ))}
                <label className="text-sm">
                  Fuel type
                  <select
                    aria-label="Fuel type"
                    className="mt-1 h-9 w-full rounded-md border border-input bg-panel px-3"
                    value={editing.fuel_type}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        fuel_type: e.target.value === "100LL" ? "100LL" : "Jet-A",
                      })
                    }
                  >
                    <option value="100LL">100LL</option>
                    <option value="Jet-A">Jet-A1</option>
                  </select>
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <Switch
                    checked={editing.active}
                    onCheckedChange={(active) => setEditing({ ...editing, active })}
                  />
                  Available for leasing
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <Switch
                    checked={editing.unpaved_capable}
                    onCheckedChange={(unpaved_capable) => setEditing({ ...editing, unpaved_capable })}
                  />
                  Bush / Unpaved Capable
                </label>
              </div>
              <Button className="mt-5" disabled={busy}>
                <Save className="h-4 w-4" />
                Save aircraft
              </Button>
            </form>
          )}
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-3">Aircraft</th>
                  <th>Seats / cargo</th>
                  <th>Range</th>
                  <th>Deposit</th>
                  <th>Weekly lease</th><th>Purchase price</th>
                  <th>Bush / Unpaved</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.aircraft.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="py-4">
                      T{a.tier} · {a.model}
                      <div className="readout text-xs text-muted-foreground">
                        {a.id} · {a.active ? "Active" : "Inactive"}
                      </div>
                    </td>
                    <td>
                      {a.pax} / {a.cargo_kg} kg
                    </td>
                    <td>{a.range_nm} NM<span className="block text-xs text-muted-foreground">{a.empty_weight_kg ?? "—"} / {a.mtow_kg ?? "—"} kg</span></td>
                    <td>{formatCr(Number(a.security_deposit))}</td>
                    <td>{formatCr(Number(a.weekly_rate))}</td><td>{formatCr(Number(a.purchase_price))}</td>
                    <td><Switch aria-label={`Bush / Unpaved Capable ${a.id}`} checked={a.unpaved_capable} disabled={busy} onCheckedChange={(unpaved_capable) => void persist({ data: { kind: "aircraft", create: false, aircraft: { ...a, fuel_type: a.fuel_type === "100LL" ? "100LL" : "Jet-A", unpaved_capable, empty_weight_kg: Number(a.empty_weight_kg ?? 0), mtow_kg: Number(a.mtow_kg ?? 0) } } })} /></td>
                    <td>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Edit ${a.id}`}
                        onClick={() => {
                          setEditing({
                            ...a,
                            fuel_type: a.fuel_type === "100LL" ? "100LL" : "Jet-A",
                            empty_weight_kg: Number(a.empty_weight_kg ?? 0),
                            mtow_kg: Number(a.mtow_kg ?? 0),
                          });
                          setCreating(false);
                        }}
                      >
                        Edit
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="users" className="mt-6">
          <div className="flex flex-wrap justify-between gap-3">
            <h2 className="text-xl font-semibold">Registered players · {data.users.length}</h2>
            <Input
              aria-label="Search players"
              placeholder="Search players or companies"
              className="max-w-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-sm [&_th]:pr-4 [&_td]:pr-4">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-3">Player</th>
                  <th>Company</th>
                  <th>ICAO</th>
                  <th>Balance</th>
                  <th>Fleet</th>
                  <th>Joined</th>
                  <th className="px-3">Supporter</th>
                  <th className="pl-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.users
                  .filter((u) =>
                    `${u.username} ${u.email} ${u.company_name} ${u.icao_code}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((u) => (
                    <tr key={u.user_id} className="border-t border-border">
                      <td className="py-4">
                        {u.username}
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td>{u.company_name ?? "No company"}</td>
                      <td className="readout">{u.icao_code ?? "—"}</td>
                      <td className="readout whitespace-nowrap">{formatCr(Number(u.balance))}</td>
                      <td>{u.fleet_count}</td>
                      <td className="whitespace-nowrap">
                        {new Date(u.joined_at).toLocaleDateString("en-US")}
                      </td>
                      <td className="px-3"><div className="flex items-center gap-2"><Switch aria-label={`Supporter ${u.icao_code ?? u.username}`} checked={u.is_supporter} disabled={busy || !u.company_id} onCheckedChange={supporter => { if (u.company_id) void persist({ data: { kind: "supporter", company: u.company_id, supporter } }); }} />{u.is_supporter && <SupporterBadge />}</div></td>
                      <td className="pl-3">
                        {u.user_id === data.viewerUserId ? <span className="whitespace-nowrap text-xs text-muted-foreground">Your account</span> : <div className="flex gap-2">
                          {u.company_id && <Button variant="outline" size="sm" className="border-amber/50 text-amber hover:bg-amber/10 hover:text-amber" disabled={busy} aria-label={`Reset company ${u.icao_code}`} onClick={() => { setPlayerAction({ kind: "reset", player: u }); setPlayerConfirmation(""); }}><RotateCcw />Reset</Button>}
                          <Button variant="destructive" size="sm" disabled={busy} aria-label={`Delete player ${u.username}`} onClick={() => { setPlayerAction({ kind: "delete", player: u }); setPlayerConfirmation(""); }}><Trash2 />Delete</Button>
                        </div>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Dialog open={playerAction !== null} onOpenChange={open => { if (!open && !busy) { setPlayerAction(null); setPlayerConfirmation(""); } }}>
            <DialogContent>
              <DialogTitle>{playerAction?.kind === "reset" ? "Reset company?" : "Permanently delete player?"}</DialogTitle>
              <DialogDescription>
                {playerAction?.kind === "reset" ? <>Reset {playerAction.player.company_name} ({playerAction.player.icao_code}) to {formatCr(startingCapital)}. All company aircraft, leases, FBOs, stakes, flights and financial history will be permanently removed. The company name, ICAO code, home base and player account remain.</> : <>Permanently delete {playerAction?.player.username} ({playerAction?.player.email}), their companies, personal hangar, pilot records and sign-in account. This cannot be undone.</>}
              </DialogDescription>
              <label className="text-sm">Type {playerAction?.kind === "reset" ? "RESET" : "DELETE"} to confirm<Input aria-label="Player action confirmation" autoComplete="off" value={playerConfirmation} disabled={busy} onChange={e => setPlayerConfirmation(e.target.value)} className="mt-2" /></label>
              <div className="flex justify-end gap-3">
                <Button variant="outline" disabled={busy} onClick={() => { setPlayerAction(null); setPlayerConfirmation(""); }}>Cancel</Button>
                <Button variant={playerAction?.kind === "reset" ? "outline" : "destructive"} className={playerAction?.kind === "reset" ? "border-amber/50 text-amber hover:bg-amber/10 hover:text-amber" : ""} disabled={busy || playerConfirmation !== (playerAction?.kind === "reset" ? "RESET" : "DELETE")} onClick={() => void confirmPlayerAction()}>{busy && <Loader2 className="animate-spin" />}{playerAction?.kind === "reset" ? "Confirm company reset" : "Confirm account deletion"}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
function RecruitmentEditor({ value, busy, onSave }: { value: unknown; busy: boolean; onSave: (value: unknown) => Promise<boolean> }) {
  const [settings, setSettings] = useState(() => recruitmentSettings(value));
  return <form className="border-y border-border py-5" onSubmit={e => { e.preventDefault(); void onSave(settings); }}>
    <h2 className="text-xl font-semibold">Pilot recruitment</h2>
    <div className="mt-4 grid gap-5 sm:grid-cols-2">
      {(["roster", "freelance"] as const).map(mode => <fieldset key={mode}>
        <legend className="text-sm font-medium">{mode === "roster" ? "Roster pilots" : "Freelance pilots"} · % of net profit</legend>
        <div className="mt-2 grid grid-cols-3 gap-2">{(["min", "default", "max"] as const).map(key => <label key={key} className="text-xs text-muted-foreground">
          {key === "min" ? "Minimum" : key === "max" ? "Maximum" : "Default"}
          <Input aria-label={`${mode} ${key} commission`} className="readout mt-1" type="number" min={0} max={100} step={0.1} required value={settings[mode][key]} onChange={e => setSettings({ ...settings, [mode]: { ...settings[mode], [key]: Number(e.target.value) } })} />
        </label>)}</div>
      </fieldset>)}
    </div>
    <Button className="mt-4" size="sm" variant="outline" disabled={busy || JSON.stringify(settings) === JSON.stringify(recruitmentSettings(value))}><Save className="h-3.5 w-3.5" />Save recruitment rules</Button>
  </form>;
}
function EconomyRow({
  row,
  busy,
  onSave,
}: {
  row: { key: string; value: unknown; description: string };
  busy: boolean;
  onSave: (value: unknown) => Promise<boolean>;
}) {
  const [value, setValue] = useState(JSON.stringify(row.value));
  const saturationField = routeSaturationFields[row.key] ?? specialMissionFields[row.key] ?? (row.key === 'spot_rental_deposit_ratio' ? { label: 'Spot Rental Refundable Deposit (base fee fraction)', min: 0, max: 5, step: 0.01 } : row.key === 'secondary_hub_rental_warmup_hours' ? { label: 'Satellite Rental Warmup (hours)', min: 0, max: 168, step: 1 } : undefined);
  const isArray = Array.isArray(row.value),
    isBool = typeof row.value === "boolean";
  return (
    <form
      className="grid items-center gap-3 py-4 sm:grid-cols-[1fr_260px_90px]"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await onSave(JSON.parse(value));
        } catch {
          toast.error("Enter a valid value");
        }
      }}
    >
      <div>
        <label htmlFor={row.key} className="text-sm font-medium capitalize">
          {saturationField?.label ?? (row.key === "fuel_price_volatility_pct" ? "Fuel Price Volatility (±fraction)" : row.key === "dispatch_usable_range_pct" ? "Dispatch Usable Range (fraction)" : row.key === "charter_by_tier" ? "Stepped Charter Surcharge" : row.key === "spot_rental_multiplier" ? "Spot Rental Rate Multiplier" : row.key === "short_hop_threshold_nm" ? "Short-Hop Threshold (NM)" : row.key === "short_hop_min_multiplier" ? "Short-Hop Minimum Charter Multiplier" : row.key === "demand_factor_by_size" ? "Passenger Demand by Destination Size" : row.key === "hub_fare_bonus_by_size" ? "Hub Fare Bonus by Destination Size" : displayTerminology(row.key.replaceAll("_", " ")))}
        </label>
        <p className="mt-1 text-xs text-muted-foreground">{displayTerminology(row.description)}</p>
      </div>
      {isBool ? (
        <Switch
          id={row.key}
          checked={value === "true"}
          onCheckedChange={(v) => setValue(String(v))}
        />
      ) : isArray ? (
        <div className="grid grid-cols-4 gap-2">
          {(JSON.parse(value) as number[]).slice(0, row.key === "charter_by_tier" ? 5 : undefined).map((item, index) => (
            <label key={index} className="text-[10px] text-muted-foreground">
              {row.key === "charter_by_tier" ? `Tier ${index === 4 ? "5–7" : index + 1} · SC/pax` : `Size ${index + 1}`}
              <Input
                aria-label={`${displayTerminology(row.key.replaceAll("_", " "))} ${index + 1}`}
                type="number"
                min="0"
                step={row.key === "charter_by_tier" ? "1" : "0.05"}
                className="readout mt-1 px-2"
                value={item}
                onChange={(e) => {
                  const values = JSON.parse(value) as number[];
                  values[index] = Number(e.target.value);
                  if (row.key === "charter_by_tier" && index === 4) {
                    values[5] = Number(e.target.value);
                    values[6] = Number(e.target.value);
                  }
                  setValue(JSON.stringify(values));
                }}
              />
            </label>
          ))}
        </div>
      ) : (
        <Input
          id={row.key}
          aria-label={displayTerminology(row.key.replaceAll("_", " "))}
          type="number"
          min={saturationField?.min ?? (row.key === "fuel_price_volatility_pct" ? 0 : row.key === "dispatch_usable_range_pct" ? 0.05 : row.key === "spot_rental_multiplier" ? 0.01 : row.key === "short_hop_min_multiplier" ? 0 : row.key === "short_hop_threshold_nm" ? 10 : undefined)}
          max={saturationField?.max ?? (row.key === "fuel_price_volatility_pct" ? 0.5 : row.key === "dispatch_usable_range_pct" || row.key === "spot_rental_multiplier" || row.key === "short_hop_min_multiplier" ? 1 : row.key === "short_hop_threshold_nm" ? 300 : undefined)}
          step={saturationField?.step ?? (row.key === "fuel_price_volatility_pct" ? "0.01" : row.key === "dispatch_usable_range_pct" || row.key === "fuel_billing_floor_pct" ? "0.05" : row.key === "passenger_weight_kg" ? "1" : row.key === "landing_fee_per_ton_mtow" ? "0.1" : row.key === "spot_rental_multiplier" || row.key === "short_hop_min_multiplier" ? "0.01" : row.key === "short_hop_threshold_nm" ? "1" : Number.isInteger(Number(row.value)) ? "1" : "0.1")}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="readout"
          required
        />
      )}
      <Button disabled={busy || value === JSON.stringify(row.value)} size="sm" variant="outline">
        <Save className="h-3.5 w-3.5" />
        Save
      </Button>
    </form>
  );
}
function FuelRow({
  rule,
  busy,
  onSave,
}: {
  rule: {
    size: number;
    fuel_type: string;
    capacity_gal: number;
    development_multiplier: number;
    refill_per_hour: number;
  };
  busy: boolean;
  onSave: (rule: {
    size: number;
    fuel_type: "100LL" | "Jet-A";
    capacity_gal: number;
    development_multiplier: number;
    refill_per_hour: number;
  }) => Promise<boolean>;
}) {
  const [edit, setEdit] = useState({
    ...rule,
    fuel_type: rule.fuel_type === "100LL" ? ("100LL" as const) : ("Jet-A" as const),
  });
  return (
    <tr className="border-t border-border">
      <td className="py-3 pr-3 whitespace-nowrap">
        {rule.size} · {rule.fuel_type === "Jet-A" ? "Jet-A1" : "100LL"}
      </td>
      {(["capacity_gal", "development_multiplier", "refill_per_hour"] as const).map((key) => (
        <td key={key} className="pr-3">
          <Input
            className="min-w-24 max-w-40"
            aria-label={`Size ${rule.size} ${rule.fuel_type} ${key}`}
            type="number"
            min="0"
            step="0.1"
            value={edit[key]}
            onChange={(e) => setEdit({ ...edit, [key]: Number(e.target.value) })}
          />
        </td>
      ))}
      <td>
        <Button
          size="icon"
          variant="outline"
          aria-label={`Save Size ${rule.size} ${rule.fuel_type}`}
          disabled={busy}
          onClick={() => onSave(edit)}
        >
          <Save className="h-4 w-4" />
        </Button>
      </td>
    </tr>
  );
}

function OperatingRulesEditor() {
  const { data } = useSuspenseQuery(fleetOverviewQuery);
  const [edit, setEdit] = useState(data.rules);
  const [busy, setBusy] = useState(false);
  const save = useServerFn(saveOperatingRules);
  const qc = useQueryClient();
  return <form className="mb-6 border-b border-border pb-5" onSubmit={async e => {
    e.preventDefault(); setBusy(true);
    try { await save({ data: edit }); await qc.invalidateQueries(); toast.success('Operating rules saved'); }
    catch(e) { toast.error(e instanceof Error ? displayTerminology(e.message) : 'Save failed'); }
    finally { setBusy(false); }
  }}>
    <h2 className="mb-4 text-lg font-semibold">Lease contracts, fuel units & cargo</h2>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {([['default_lease_weeks','Default lease (weeks)'],['renewal_discount','Renewal discount (fraction)'],['avgas_kg_per_litre','100LL density (kg/L)'],['jeta_kg_per_litre','Jet-A1 density (kg/L)'],['cargo_pax_rate_ratio','Cargo rate (100 kg = × pax fare)'],['cargo_airport_fee_discount','All-Cargo airport fee discount (fraction)'],['all_cargo_capacity_bonus','All-Cargo capacity bonus (fraction)'],['depreciation_pct_per_100h','Depreciation (% of list per 100 h)'],['depreciation_floor_pct','Residual value floor (%)']] as const).map(([key,label]) => <label key={key} className="text-sm">{label}<Input aria-label={label} className="mt-1" required type="number" min={key === 'renewal_discount' || key.startsWith('cargo') || key.startsWith('all_cargo') ? 0 : 0.01} max={key === 'default_lease_weeks' ? 52 : key.startsWith('depreciation') ? 100 : key === 'renewal_discount' || key === 'cargo_airport_fee_discount' ? 1 : undefined} step={key === 'default_lease_weeks' ? 1 : key.startsWith('depreciation') ? 0.1 : 0.01} value={edit[key]} onChange={e => setEdit({...edit,[key]:Number(e.target.value)})} /></label>)}
    </div>
    <Button className="mt-4" variant="outline" disabled={busy}><Save className="h-4 w-4"/>Save operating rules</Button>
  </form>;
}

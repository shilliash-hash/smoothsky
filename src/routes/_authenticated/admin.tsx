import { createFileRoute, redirect } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Plus, Save, Shield, X } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/game/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { adminAccessQuery, adminDataQuery } from "@/lib/admin";
import { saveAdminData } from "@/lib/admin.functions";
import { companyQuery } from "@/lib/game";
import { formatCr } from "@/lib/rules";
import type { AircraftEdit } from "@/lib/admin-rules";

export const Route = createFileRoute("/_authenticated/admin")({
  loader: async ({ context }) => {
    if (!(await context.queryClient.ensureQueryData(adminAccessQuery)))
      throw redirect({ to: "/dashboard" });
    await Promise.all([
      context.queryClient.ensureQueryData(adminDataQuery),
      context.queryClient.ensureQueryData(companyQuery),
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
  fuel_type: "100LL",
  fuel_burn_gph: 9,
  fuel_capacity_gal: 56,
  minimum_runway_ft: 1500,
  active: true,
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
  async function persist(payload: Parameters<typeof save>[0]) {
    setBusy(true);
    try {
      await save(payload);
      await qc.invalidateQueries();
      toast.success("Changes saved");
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
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
          <div className="divide-y divide-border">
            {data.economy.map((row) => (
              <EconomyRow
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
                    ["fuel_burn_gph", "Fuel burn (gal/h)"],
                    ["fuel_capacity_gal", "Fuel capacity (gal)"],
                    ["minimum_runway_ft", "Minimum runway (ft)"],
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
                          "fuel_burn_gph",
                          "fuel_capacity_gal",
                        ].includes(key)
                          ? "0.01"
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
                  <th>Weekly lease</th>
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
                    <td>{a.range_nm} NM</td>
                    <td>{formatCr(Number(a.security_deposit))}</td>
                    <td>{formatCr(Number(a.weekly_rate))}</td>
                    <td>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Edit ${a.id}`}
                        onClick={() => {
                          setEditing({
                            ...a,
                            fuel_type: a.fuel_type === "100LL" ? "100LL" : "Jet-A",
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
            <table className="w-full text-left text-sm">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="py-3">Player</th>
                  <th>Company</th>
                  <th>ICAO</th>
                  <th>Balance</th>
                  <th>Fleet</th>
                  <th>Joined</th>
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
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </AppShell>
  );
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
          {row.key.replaceAll("_", " ")}
        </label>
        <p className="mt-1 text-xs text-muted-foreground">{row.description}</p>
      </div>
      {isBool ? (
        <Switch
          id={row.key}
          checked={value === "true"}
          onCheckedChange={(v) => setValue(String(v))}
        />
      ) : isArray ? (
        <div className="grid grid-cols-4 gap-2">
          {(JSON.parse(value) as number[]).map((item, index) => (
            <label key={index} className="text-[10px] text-muted-foreground">
              {row.key === "charter_by_tier" ? "T" : "Size "}
              {index + 1}
              <Input
                aria-label={`${row.key.replaceAll("_", " ")} ${index + 1}`}
                type="number"
                min="0"
                step="any"
                className="readout mt-1 px-2"
                value={item}
                onChange={(e) => {
                  const values = JSON.parse(value) as number[];
                  values[index] = Number(e.target.value);
                  setValue(JSON.stringify(values));
                }}
              />
            </label>
          ))}
        </div>
      ) : (
        <Input
          id={row.key}
          aria-label={row.key.replaceAll("_", " ")}
          type="number"
          step="any"
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
            step="any"
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

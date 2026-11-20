import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { flightNumberSchema } from "./flight-number";
import { operationalAirportCodes } from "./operations-airports";
export const getOperations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const sync = await db.rpc("process_due_obligations");
    if (sync.error) throw new Error(sync.error.message);
    const settled = await db.rpc("settle_due_test_flights");
    if (settled.error) throw new Error(settled.error.message);
    const { data: company, error: ce } = await db.from("companies").select("*").eq("is_personal", false).maybeSingle();
    if (ce) throw ce;
    const metrics = [];
    const pools = [];
    for (let offset = 0; ; offset += 1000) {
      const [m, p] = await Promise.all([
        db.rpc("radar_airport_metrics").order("icao").range(offset, offset + 999),
        db
          .from("airport_passenger_pools")
          .select("*")
          .order("airport_icao")
          .range(offset, offset + 999),
      ]);
      if (m.error) throw m.error;
      if (p.error) throw p.error;
      metrics.push(...(m.data ?? []));
      pools.push(...(p.data ?? []));
      if ((m.data?.length ?? 0) < 1000 && (p.data?.length ?? 0) < 1000) break;
    }
    const [r, f, l, t, n, bases] = await Promise.all([
      db.from("economy_config").select("*"),
      db.from("flights").select("*, aircraft:fleet_aircraft(registration)").order("created_at", { ascending: false }).limit(100),
      db.from("fleet_aircraft").select("*, type:aircraft_types(*)").is("returned_at", null),
      db.from("company_ledger").select("*").order("id", { ascending: false }).limit(1),
      db.rpc("next_flight_number"),
      db.from("company_fobs").select("*").is("closed_at", null),
    ]);
    for (const result of [r, f, l, t, n, bases]) if (result.error) throw result.error;
    // Lightweight catalogue: major ports, owner-touched airports and global aggregate hotspots.
    const active = await db.from("flights").select("origin_icao, destination_icao").in("status", ["DISPATCHED", "EN_ROUTE"]);
    if (active.error) throw active.error;
    const needed = new Set<string>();
    for (const x of active.data ?? []) { needed.add(x.origin_icao); needed.add(x.destination_icao); }
    for (const x of l.data ?? []) needed.add(x.location_icao);
    for (const x of bases.data ?? []) needed.add(x.airport_icao);
    if (company?.home_base_icao) needed.add(company.home_base_icao);
    const extraCodes = operationalAirportCodes(metrics, needed);
    const loadExtra = async () => {
      const airports = [];
      // Bound IN-query URLs and avoid the Data API's per-response row cap.
      for (let offset = 0; offset < extraCodes.length; offset += 200) {
        const result = await db.from("airports").select("*").in("icao", extraCodes.slice(offset, offset + 200));
        if (result.error) throw result.error;
        airports.push(...(result.data ?? []));
      }
      return airports;
    };
    const [major, extra] = await Promise.all([
      db.from("airports").select("*").gte("size", 4).order("size", { ascending: false }).limit(1500),
      loadExtra(),
    ]);
    if (major.error) throw major.error;
    const byIcao = new Map<string, NonNullable<typeof major.data>[number]>();
    for (const a of [...(major.data ?? []), ...extra]) byIcao.set(a.icao, a);
    const airports = [...byIcao.values()];
    return {
      nextFlightNumber: n.data,
      bases: bases.data ?? [],
      company,
      airports,
      rules: Object.fromEntries((r.data ?? []).map((x) => [x.key, x.value])),
      pools: pools.filter((x) => byIcao.has(x.airport_icao)),
      metrics: metrics.filter((x) => byIcao.has(x.icao)),
      flights: f.data ?? [],
      fleet: l.data ?? [],
      balance: Number(t.data?.[0]?.balance_after ?? 0),
      serverTime: Date.now(),
    };
  });
export const flightAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      action: z.enum(["quote", "dispatch", "start", "settle", "cancel"]),
      aircraft: z.string().uuid().optional(),
      destination: z.string().optional(),
      flightNumber: flightNumberSchema.optional(),
      flight: z.string().uuid().optional(),
      cargoKg: z.number().int().min(0).max(100000).optional(),
      allCargo: z.boolean().optional(),
      mission: z.string().uuid().optional(),
      simulation: z.boolean().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const sync = await db.rpc("process_due_obligations");
    if (sync.error) throw new Error(sync.error.message);
    if (data.action === "quote" || data.action === "dispatch") {
      if (!data.aircraft || !data.destination) throw new Error("Aircraft and destination required");
      const { data: result, error } = await db.rpc(
        data.action === "quote" ? "flight_quote_full" : "dispatch_flight_full",
        {
          p_aircraft: data.aircraft,
          p_destination: data.destination,
          p_cargo_kg: data.cargoKg ?? 0,
          p_all_cargo: data.allCargo ?? false,
          ...(data.mission ? { p_mission: data.mission } : {}),
          ...(data.action === "dispatch" ? { p_flight_number: data.flightNumber ?? "" } : {}),
        } as never,
      );
      if (error) throw new Error(error.message);
      if (data.action === "dispatch" && data.simulation === false && typeof result === "string") {
        const mark = await db.rpc("mark_flight_acars" as never, { p_flight: result } as never);
        if (mark.error) throw new Error(mark.error.message);
      }
      return result;
    }
    if (!data.flight) throw new Error("Flight required");
    const { data: result, error } = await db.rpc(
      data.action === "start"
        ? "start_test_flight"
        : data.action === "cancel"
          ? "cancel_test_flight"
          : "settle_flight",
      { p_flight: data.flight },
    );
    if (error) throw new Error(error.message);
    return result;
  });

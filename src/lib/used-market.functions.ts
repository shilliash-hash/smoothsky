import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export type UsedListing = { id: string; is_broker: boolean; seller_name: string | null; is_mine: boolean; aircraft_type_id: string; manufacturer: string; model: string; tier: number; registration: string; location_icao: string; airport_name: string; airframe_hours: number; catalog_price: number; depreciated_value: number; asking_price: number; created_at: string };

export const getUsedMarket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = context.supabase;
    const [listings, rules, owned] = await Promise.all([
      db.rpc("used_market"),
      db.from("operating_rules").select("depreciation_pct_per_100h,depreciation_floor_pct").single(),
      db.from("fleet_aircraft").select("id,registration,status,location_icao,airframe_hours,ownership,returned_at,type:aircraft_types(manufacturer,model,tier,purchase_price)").eq("ownership", "OWNED").is("returned_at", null),
    ]);
    if (listings.error) throw new Error(listings.error.message);
    if (rules.error) throw new Error(rules.error.message);
    if (owned.error) throw new Error(owned.error.message);
    return { listings: (listings.data ?? []) as UsedListing[], rules: rules.data, owned: owned.data };
  });

export const usedMarketAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.discriminatedUnion("action", [
    z.object({ action: z.literal("buy"), listing: z.string().uuid() }),
    z.object({ action: z.literal("cancel"), listing: z.string().uuid() }),
    z.object({ action: z.literal("list"), aircraft: z.string().uuid(), price: z.number().positive() }),
  ]))
  .handler(async ({ data, context }) => {
    const db = context.supabase;
    const result = data.action === "buy" ? await db.rpc("buy_used_aircraft", { p_listing: data.listing })
      : data.action === "cancel" ? await db.rpc("cancel_used_listing", { p_listing: data.listing })
      : await db.rpc("list_used_aircraft", { p_aircraft: data.aircraft, p_price: data.price });
    if (result.error) throw new Error(result.error.message);
    return true;
  });

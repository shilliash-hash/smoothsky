import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};
export const preflight = () => new Response(null, { status: 204, headers: cors });
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors });

export const positionSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  altitude_ft: z.number().min(-2000).max(60000),
  ground_speed_kt: z.number().min(0).max(1200),
  heading: z.number().min(0).max(360),
  fuel_gal: z.number().min(0).max(100000),
  phase: z.enum(["PREFLIGHT", "TAXI", "TAKEOFF", "CLIMB", "CRUISE", "DESCENT", "APPROACH", "LANDING", "TAXI_IN", "PARKED"]),
});
export const pirepSchema = z.object({
  fuel_used_gal: z.number().min(0).max(100000),
  landing_rate_fpm: z.number().min(-5000).max(1000),
  flight_time_hours: z.number().min(0).max(30),
});

type Rpc = "acars_connect" | "acars_position" | "acars_pirep";

/** Verifies the Bearer pilot key inside SQL and calls the ACARS function with the publishable client. */
export async function acarsCall(request: Request, fn: Rpc, schema?: z.ZodTypeAny) {
  const key = request.headers.get("authorization")?.match(/^Bearer\s+(ssk_[a-f0-9]{64})$/)?.[1];
  if (!key) return json({ error: "Missing or malformed Authorization: Bearer <acars_api_key>" }, 401);
  let payload: unknown = {};
  if (schema) {
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: "Invalid payload", issues: parsed.error.flatten() }, 400);
    payload = parsed.data;
  }
  const url = process.env["SUPABASE_URL"]!;
  const anon = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const db = createClient<Database>(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (anon.startsWith("sb_") && h.get("Authorization") === `Bearer ${anon}`) h.delete("Authorization");
        h.set("apikey", anon);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const args = fn === "acars_connect" ? { p_key: key } : { p_key: key, p: payload as never };
  const { data, error } = await db.rpc(fn, args as never);
  if (error) {
    const status = error.code === "28000" ? 401 : error.code === "P0002" ? 404 : error.code === "P0409" ? 409 : error.code === "P0429" ? 429 : 422;
    return json({ error: error.message }, status);
  }
  return json(data);
}

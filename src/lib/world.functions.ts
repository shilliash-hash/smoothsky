import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type WorldTelemetry = { airports: number; airlines: number; pilots: number; flights: number };

/** Public aggregate counts only — no player data. */
export const getWorldTelemetry = createServerFn({ method: "GET" }).handler(async (): Promise<WorldTelemetry | null> => {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  const db = createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await db.rpc("world_telemetry");
  if (error || !data) return null;
  return data as unknown as WorldTelemetry;
});

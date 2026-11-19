import { createFileRoute } from "@tanstack/react-router";
import { acarsCall, preflight } from "@/lib/acars-gateway";

/** Returns the pilot's DISPATCHED or EN_ROUTE flight so a restarted ACARS client can resume. */
export const Route = createFileRoute("/api/public/acars/active")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      GET: async ({ request }) => acarsCall(request, "acars_connect"),
      POST: async ({ request }) => acarsCall(request, "acars_connect"),
    },
  },
});

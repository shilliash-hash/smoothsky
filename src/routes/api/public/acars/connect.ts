import { createFileRoute } from "@tanstack/react-router";
import { acarsCall, preflight } from "@/lib/acars-gateway";

export const Route = createFileRoute("/api/public/acars/connect")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => acarsCall(request, "acars_connect"),
    },
  },
});

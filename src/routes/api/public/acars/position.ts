import { createFileRoute } from "@tanstack/react-router";
import { acarsCall, preflight, positionSchema } from "@/lib/acars-gateway";

export const Route = createFileRoute("/api/public/acars/position")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => acarsCall(request, "acars_position", positionSchema),
    },
  },
});

import { createFileRoute } from "@tanstack/react-router";
import { acarsCall, preflight, pirepSchema } from "@/lib/acars-gateway";

export const Route = createFileRoute("/api/public/acars/pirep")({
  server: {
    handlers: {
      OPTIONS: async () => preflight(),
      POST: async ({ request }) => acarsCall(request, "acars_pirep", pirepSchema),
    },
  },
});

import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { canUseCachedSession } from "@/lib/query-resilience";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data: local } = await supabase.auth.getSession();
    const { data, error } = await supabase.auth.getUser();
    if (data.user) return { user: data.user };
    // A sleeping/offline tab is not a sign-out. RPCs still enforce auth on every request.
    if (local.session && error && canUseCachedSession(error)) return { user: local.session.user };
    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});

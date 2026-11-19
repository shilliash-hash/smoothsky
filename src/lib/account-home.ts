import { supabase } from "@/integrations/supabase/client";

// Public entry points call this only after confirming a browser session.
export async function accountHome(userId: string): Promise<"/dashboard" | "/profile" | "/onboarding"> {
  const [company, profile] = await Promise.all([
    supabase.from("companies").select("id").eq("user_id", userId).eq("is_personal", false).maybeSingle(),
    supabase.from("profiles").select("career_role").eq("id", userId).maybeSingle(),
  ]);
  if (company.error) throw company.error;
  if (profile.error) throw profile.error;
  if (profile.data?.career_role === "PILOT_ONLY") return "/profile";
  return company.data ? "/dashboard" : "/onboarding";
}
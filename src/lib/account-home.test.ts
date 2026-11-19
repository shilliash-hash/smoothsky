import { beforeEach, describe, expect, it, vi } from "vitest";

const from = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));
import { accountHome } from "./account-home";
import { companyQuery } from "./game";

function result(data: unknown, error: unknown = null) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error }) };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

describe("Account entry destinations", () => {
  beforeEach(() => from.mockReset());

  it("sends PILOT_ONLY without an airline to /profile using optional owner reads", async () => {
    const company = result(null);
    const profile = result({ career_role: "PILOT_ONLY" });
    from.mockReturnValueOnce(company).mockReturnValueOnce(profile);
    expect(await accountHome("pilot-id")).toBe("/profile");
    expect(company.eq).toHaveBeenCalledWith("user_id", "pilot-id");
    expect(company.eq).toHaveBeenCalledWith("is_personal", false);
    expect(profile.eq).toHaveBeenCalledWith("id", "pilot-id");
    expect(company.maybeSingle).toHaveBeenCalledOnce();
    expect(profile.maybeSingle).toHaveBeenCalledOnce();
  });

  it("sends an airline owner to /dashboard", async () => {
    from.mockReturnValueOnce(result({ id: "airline-id" })).mockReturnValueOnce(result({ career_role: "ENTREPRENEUR" }));
    expect(await accountHome("owner-id")).toBe("/dashboard");
  });

  it("sends an account without a chosen career to /onboarding", async () => {
    from.mockReturnValueOnce(result(null)).mockReturnValueOnce(result(null));
    expect(await accountHome("new-id")).toBe("/onboarding");
  });

  it("does not turn a failed company read into onboarding", async () => {
    const error = new Error("Connection interrupted");
    from.mockReturnValueOnce(result(null, error)).mockReturnValueOnce(result(null));
    await expect(accountHome("pilot-id")).rejects.toBe(error);
  });

  it("returns null for the shared company query used by Admin and AppShell", async () => {
    const company = result(null);
    from.mockReturnValue(company);
    if (!companyQuery.queryFn) throw new Error("Company query required");
    expect(await companyQuery.queryFn({} as never)).toBeNull();
    expect(company.maybeSingle).toHaveBeenCalledOnce();
  });
});
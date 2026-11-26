import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  canUseCachedSession,
  isTransientDataError,
  queryRetryDelay,
  shouldRetryQuery,
} from "./query-resilience";

describe("query resilience", () => {
  it("retries an interrupted fetch twice and then surfaces the error", () => {
    const error = new TypeError("Failed to fetch");
    expect(shouldRetryQuery(1, error)).toBe(true);
    expect(shouldRetryQuery(2, error)).toBe(true);
    expect(shouldRetryQuery(3, error)).toBe(false);
  });

  it("retries temporary auth and upstream failures", () => {
    expect(isTransientDataError(new AuthRetryableFetchError("offline", 0))).toBe(true);
    expect(isTransientDataError(new AuthApiError("Unavailable", 503, "service_unavailable"))).toBe(
      true,
    );
    expect(queryRetryDelay(0)).toBe(1000);
    expect(queryRetryDelay(3)).toBe(8000);
  });

  it("does not retry invalid credentials or permissions", () => {
    const error = new AuthApiError("Invalid JWT", 401, "invalid_jwt");
    expect(shouldRetryQuery(1, error)).toBe(false);
    expect(canUseCachedSession(error)).toBe(false);
  });

  it("keeps a cached identity only for a transient validation failure", () => {
    expect(canUseCachedSession(new AuthRetryableFetchError("Network request failed", 0))).toBe(
      true,
    );
    expect(canUseCachedSession(new Error("Invalid login credentials"))).toBe(false);
  });
});

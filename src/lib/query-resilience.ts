import { isAuthRetryableFetchError } from "@supabase/supabase-js";

const transientMessage =
  /failed to fetch|fetch failed|networkerror|network request failed|load failed|internet connection|econnreset|etimedout|temporarily unavailable|service unavailable|gateway timeout/i;

function errorStatus(error: unknown): number | undefined {
  if (error == null || typeof error !== "object" || !("status" in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/** Network and upstream failures are retryable; auth/permission/business errors are not. */
export function isTransientDataError(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  const status = errorStatus(error);
  if (
    status === 0 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status !== undefined && status >= 500)
  )
    return true;
  if (status !== undefined) return false;
  if (error instanceof TypeError) return true;
  return error instanceof Error && transientMessage.test(error.message);
}

/** At most two retries, so a real outage does not leave navigation pending indefinitely. */
export function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  return failureCount < 3 && isTransientDataError(error);
}

export function queryRetryDelay(attemptIndex: number): number {
  return Math.min(1000 * 2 ** attemptIndex, 8000);
}

/** A cached identity may keep the shell open offline; protected RPCs still validate the bearer. */
export function canUseCachedSession(error: unknown): boolean {
  return isTransientDataError(error);
}

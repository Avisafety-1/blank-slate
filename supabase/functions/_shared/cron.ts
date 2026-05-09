// Shared cron / internal-system authentication helper
// Used by Edge Functions that should only be reachable from
// pg_cron jobs, DB triggers (pg_net), or other trusted internal callers.

import { AuthError } from "./auth.ts";

/**
 * Verify the request carries the shared cron secret.
 * Accepts either `x-cron-secret` or `x-internal-secret` (alias).
 * Throws AuthError(401) if missing or wrong.
 */
export function requireCronSecret(req: Request): void {
  const expected = Deno.env.get("CRON_SHARED_SECRET");
  if (!expected) {
    throw new AuthError(500, "CRON_SHARED_SECRET not configured on server");
  }
  const provided =
    req.headers.get("x-cron-secret") ??
    req.headers.get("x-internal-secret") ??
    "";
  // Constant-time-ish compare
  if (provided.length !== expected.length || provided !== expected) {
    throw new AuthError(401, "Invalid or missing cron secret");
  }
}

/** Returns true if the request carries a valid cron secret (no throw). */
export function hasValidCronSecret(req: Request): boolean {
  try {
    requireCronSecret(req);
    return true;
  } catch {
    return false;
  }
}

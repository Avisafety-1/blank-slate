// Shared auth helpers for Edge Functions
// Used by all functions hardened as part of pentest 2026-05-08 remediation
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.81.0";

export type AppRole = "user" | "admin" | "superadmin";

export interface AuthedUser {
  id: string;
  email?: string;
  client: SupabaseClient; // anon-key client bound to caller's JWT (RLS applies)
  service: SupabaseClient; // service-role client (RLS bypass) for explicit checks only
}

export class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/**
 * Verify the request carries a valid Supabase JWT and return the user
 * plus a client bound to that JWT (so RLS applies on all queries).
 */
export async function requireUser(req: Request): Promise<AuthedUser> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    throw new AuthError(401, "Missing Authorization header");
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const client = createClient(url, anon, {
    global: { headers: { Authorization: authHeader } },
  });

  const token = authHeader.replace("Bearer ", "");
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    throw new AuthError(401, "Invalid or expired token");
  }

  return {
    id: data.user.id,
    email: data.user.email ?? undefined,
    client,
    service: serviceClient(),
  };
}

/**
 * Require the user to have at least one of the given roles.
 * Roles are read from public.user_roles via the service client
 * (avoids RLS recursion on the roles table).
 */
export async function requireRole(
  user: AuthedUser,
  roles: AppRole[],
): Promise<void> {
  const { data, error } = await user.service
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (error) throw new AuthError(500, `Role lookup failed: ${error.message}`);
  const userRoles = (data ?? []).map((r: any) => r.role as AppRole);
  if (!userRoles.some((r) => roles.includes(r))) {
    throw new AuthError(403, "Insufficient role");
  }
}

/** Get the company_id from the caller's profiles row (service client). */
export async function getUserCompanyId(user: AuthedUser): Promise<string | null> {
  const { data, error } = await user.service
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new AuthError(500, `Profile lookup failed: ${error.message}`);
  return data?.company_id ?? null;
}

/** Wrap a thrown AuthError into a Response with CORS headers. */
export function authErrorResponse(
  err: unknown,
  corsHeaders: Record<string, string>,
): Response {
  if (err instanceof AuthError) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: err.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  console.error("Unexpected auth error:", err);
  return new Response(JSON.stringify({ error: "Internal error" }), {
    status: 500,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

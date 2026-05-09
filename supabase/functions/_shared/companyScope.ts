// Shared company-scope helpers
// Ensures a caller can only act on company_ids they are allowed to see
// (either their own company or a child via the hierarchy).

import { AuthedUser, AuthError } from "./auth.ts";

/**
 * Assert that the user is allowed to access the given company_id.
 * Uses the existing SECURITY DEFINER function `get_user_visible_company_ids`
 * which returns the user's own company plus any descendant companies they
 * can see via the hierarchy.
 *
 * Avisafe superadmins bypass the check (they can see everything).
 */
export async function assertUserInCompany(
  user: AuthedUser,
  companyId: string,
): Promise<void> {
  if (!companyId) {
    throw new AuthError(400, "Missing companyId");
  }

  // Superadmin bypass
  const { data: roleRows } = await user.service
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);
  const isSuperadmin = (roleRows ?? []).some(
    (r: any) => r.role === "superadmin",
  );
  if (isSuperadmin) return;

  // Use the security-definer function to get the visible set
  const { data, error } = await user.service.rpc(
    "get_user_visible_company_ids",
    { _user_id: user.id },
  );
  if (error) {
    throw new AuthError(500, `Visibility lookup failed: ${error.message}`);
  }
  const visible = (data ?? []).map((row: any) =>
    typeof row === "string" ? row : row.company_id ?? row.id ?? row,
  );
  if (!visible.includes(companyId)) {
    throw new AuthError(403, "Company not accessible to caller");
  }
}

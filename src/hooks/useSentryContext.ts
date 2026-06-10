import { useEffect } from "react";
import { Sentry } from "@/lib/sentry";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Synker Sentry-scopet (user, company-tags, company-context) med
 * AuthContext. Sender kun anonymiserte felter — ingen epost, telefon
 * eller andre persondata.
 *
 * Skal monteres én gang inne i AuthProvider-treet (f.eks. i App.tsx).
 */
export const useSentryContext = () => {
  const { user, companyId, companyName, companyType, userRole } = useAuth();

  useEffect(() => {
    if (!user) {
      Sentry.setUser(null);
      // Fjern tidligere tags ved logout
      Sentry.setTag("company_id", undefined as unknown as string);
      Sentry.setTag("company_type", undefined as unknown as string);
      Sentry.setTag("user_role", undefined as unknown as string);
      Sentry.setContext("company", null);
      return;
    }

    // KUN UUID — ingen epost/telefon/ip
    Sentry.setUser({ id: user.id });

    Sentry.setTag("company_id", companyId ?? "none");
    Sentry.setTag("company_type", companyType ?? "none");
    Sentry.setTag("user_role", userRole ?? "none");

    Sentry.setContext(
      "company",
      companyId
        ? {
            id: companyId,
            name: companyName ?? null,
            type: companyType ?? null,
          }
        : null,
    );
  }, [user, companyId, companyName, companyType, userRole]);
};

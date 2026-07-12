// Delt språk-modul for e-post-edge-functions.
// Regel: alle bruker-vendte strenger fra e-post-funksjoner MÅ gå via denne modulen
// eller default-templates per språk. Se mem://preferences/i18n-mandatory.

export type EmailLanguage = "no" | "en";

const SUPPORTED: readonly EmailLanguage[] = ["no", "en"] as const;

/**
 * Normaliserer et språk-hint til støttet EmailLanguage.
 * Fallback: 'no' (norsk er default for AviSafe).
 */
export function normalizeLanguage(input: unknown): EmailLanguage {
  if (typeof input !== "string") return "no";
  const lower = input.toLowerCase().trim();
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("no") || lower.startsWith("nb") || lower.startsWith("nn")) return "no";
  return "no";
}

/**
 * Leser språk fra (i prioritet): body.language, request Accept-Language header, fallback 'no'.
 */
export function resolveLanguage(
  req: Request,
  body?: { language?: string | null } | null
): EmailLanguage {
  if (body?.language) return normalizeLanguage(body.language);
  const header = req.headers.get("accept-language");
  if (header) {
    // Parse f.eks. "en-US,en;q=0.9,no;q=0.8" → første tag
    const first = header.split(",")[0]?.split(";")[0]?.trim();
    if (first) return normalizeLanguage(first);
  }
  return "no";
}

/**
 * Klient-vendte API-svarstrenger (feilmeldinger, generiske statusmeldinger).
 * Ikke HTML-e-post-innhold — det ligger i defaultTemplates per språk i template-utils.ts.
 */
export const apiMessages: Record<EmailLanguage, Record<string, string>> = {
  no: {
    noEmailProvided: "Ingen e-post oppgitt",
    emailRequired: "E-post er påkrevd",
    genericError: "En feil oppstod",
    passwordResetGeneric: "Hvis e-posten finnes i systemet, vil du motta en tilbakestillingslenke",
    couldNotFetchUser: "Kunne ikke hente brukerinfo",
    couldNotGenerateResetLink: "Kunne ikke generere tilbakestillingslenke",
    couldNotExtractToken: "Kunne ikke ekstrahere token fra lenke",
    invalidRequest: "Ugyldig forespørsel",
    unauthorized: "Ikke autorisert",
    userNotFound: "Bruker ikke funnet",
    companyNotFound: "Selskap ikke funnet",
    invitationExpired: "Invitasjonen er utløpt",
    invitationUsed: "Invitasjonen er allerede brukt",
  },
  en: {
    noEmailProvided: "No email provided",
    emailRequired: "Email is required",
    genericError: "An error occurred",
    passwordResetGeneric: "If the email exists in the system, you will receive a reset link",
    couldNotFetchUser: "Could not fetch user info",
    couldNotGenerateResetLink: "Could not generate reset link",
    couldNotExtractToken: "Could not extract token from link",
    invalidRequest: "Invalid request",
    unauthorized: "Unauthorized",
    userNotFound: "User not found",
    companyNotFound: "Company not found",
    invitationExpired: "The invitation has expired",
    invitationUsed: "The invitation has already been used",
  },
};

export function t(language: EmailLanguage, key: string): string {
  return apiMessages[language]?.[key] ?? apiMessages.no[key] ?? key;
}

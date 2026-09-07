import i18n from "@/i18n";

/**
 * Oversetter tekniske feilkoder fra `acknowledge_resource_warning` til
 * lesbare meldinger. Ukjente databasefeil vises som en generisk melding
 * i stedet for rå SQL-tekst.
 */
export function acknowledgeErrorMessage(raw: unknown): string {
  const t = i18n.t.bind(i18n);
  const message = String((raw as { message?: string })?.message ?? raw ?? "");

  if (/not_authenticated/.test(message)) return t("acknowledgeErrors.notAuthenticated");
  if (/not_authorized/.test(message)) return t("acknowledgeErrors.notAuthorized");
  if (/resource_not_found/.test(message)) return t("acknowledgeErrors.notFound");
  if (/invalid_resource_type/.test(message)) return t("acknowledgeErrors.generic");
  return t("acknowledgeErrors.generic");
}

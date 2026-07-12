import { supabase } from "@/integrations/supabase/client";
import i18n from "@/i18n";

/**
 * Wrapper around `supabase.functions.invoke` for e-post-relaterte edge functions.
 *
 * Legger automatisk til `language: i18n.language` i request body slik at
 * mottakeren får e-post på riktig språk (kilde: brukerens valgte UI-språk).
 *
 * Bruk denne for ALLE kall til e-post-edge-functions – aldri kall
 * `supabase.functions.invoke` direkte for disse. Se
 * mem://preferences/i18n-mandatory punkt 6.
 */
export const EMAIL_FUNCTION_NAMES = [
  "send-user-welcome-email",
  "send-customer-welcome-email",
  "send-user-approved-email",
  "send-password-reset",
  "invite-user",
  "resend-confirmation-email",
  "send-notification-email",
  "send-feedback",
  "preview-currency-emails",
  "send-template-previews",
  "test-email",
] as const;

export type EmailFunctionName = (typeof EMAIL_FUNCTION_NAMES)[number];

export function invokeEmailFunction<T = unknown>(
  functionName: EmailFunctionName,
  options: { body?: Record<string, unknown>; headers?: Record<string, string> } = {},
) {
  const body = {
    ...(options.body ?? {}),
    // Rekipient-språk kan overstyres av kalleren; fallback er UI-språket til den
    // som utløser handlingen.
    language: (options.body as any)?.language ?? i18n.language ?? "no",
  };
  return supabase.functions.invoke<T>(functionName, { ...options, body });
}

import i18n from "@/i18n";

/**
 * Oversetter feil fra `supabase.auth.updateUser({ password })` til
 * brukervennlige meldinger, og forteller om brukeren kan prøve på nytt
 * med samme gjenopprettingslenke (`recoverable`) eller må be om ny lenke.
 */
export interface ResetPasswordErrorInfo {
  message: string;
  recoverable: boolean;
}

export function resetPasswordErrorInfo(raw: unknown): ResetPasswordErrorInfo {
  const t = i18n.t.bind(i18n);
  const err = raw as { code?: string; message?: string; status?: number } | undefined;
  const code = String(err?.code ?? "").toLowerCase();
  const message = String(err?.message ?? raw ?? "").toLowerCase();
  const key = (k: string) => t(`auth.resetPassword2.errors.${k}`);

  const has = (...needles: string[]) =>
    needles.some((n) => code.includes(n) || message.includes(n));

  if (has("same_password", "should be different from the old password")) {
    return { message: key("samePassword"), recoverable: true };
  }
  if (has("pwned", "leaked", "compromised", "too common")) {
    return { message: key("pwnedPassword"), recoverable: true };
  }
  if (has("weak_password", "password should be at least", "password is too short", "weak")) {
    return { message: key("weakPassword"), recoverable: true };
  }
  if (has("over_request_rate_limit", "rate limit", "too many requests") || err?.status === 429) {
    return { message: key("rateLimited"), recoverable: true };
  }
  if (
    has(
      "session_not_found",
      "invalid token",
      "token has expired",
      "otp_expired",
      "invalid_token",
      "jwt expired",
      "auth session missing",
      "refresh_token",
      "unauthorized",
    ) ||
    err?.status === 401 ||
    err?.status === 403
  ) {
    return { message: key("linkExpired"), recoverable: false };
  }

  return { message: key("generic"), recoverable: true };
}

import type { Session } from "@supabase/supabase-js";

type AmrEntry = { method: string; timestamp?: number };

function decodeJwtPayload(token: string): Record<string, any> | null {
  const base64Url = token.split(".")[1];
  if (!base64Url) return null;
  try {
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(
      base64.length + ((4 - (base64.length % 4)) % 4),
      "="
    );
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getAmr(session: Session | null): AmrEntry[] {
  const token = session?.access_token;
  if (!token) return [];
  const payload = decodeJwtPayload(token);
  return Array.isArray(payload?.amr) ? (payload!.amr as AmrEntry[]) : [];
}

/**
 * Returnerer true hvis denne sesjonen ble autentisert med passkey/WebAuthn.
 * Vi sjekker hele amr-arrayen (ikke bare siste entry), fordi Supabase
 * ikke garanterer rekkefølge. En passkey-autentisering i sesjonens historikk
 * er tilstrekkelig bevis på sterk auth (NIST AAL2/AAL3) og kan brukes til
 * å hoppe over TOTP-2FA-utfordringen.
 */
export function isPasskeyLogin(session: Session | null): boolean {
  const amr = getAmr(session);
  return amr.some(
    (e) => e?.method === "passkey" || e?.method === "webauthn"
  );
}

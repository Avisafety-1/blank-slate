import { supabase } from "@/integrations/supabase/client";

/**
 * Rewrites user-visible file URLs (signed + public storage URLs) from the raw
 * Supabase host to the branded api.avisafe.no domain.
 *
 * Deliberately NOT changing the Supabase client base URL: auth tokens are stored
 * under a key derived from that hostname, so switching it would log everyone out.
 * Auth, database and edge function calls keep using the original Supabase URL.
 * The old domain keeps working, so any already-shared links remain valid.
 *
 * Kill switch: set PUBLIC_API_DOMAIN_ENABLED = false to revert instantly.
 */
export const PUBLIC_API_DOMAIN_ENABLED = true;
export const PUBLIC_API_ORIGIN = "https://api.avisafe.no";
const SUPABASE_ORIGIN = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");

export function toPublicApiUrl<T extends string | null | undefined>(url: T): T {
  if (!PUBLIC_API_DOMAIN_ENABLED || !url || !SUPABASE_ORIGIN) return url;
  return (url.startsWith(SUPABASE_ORIGIN) ? PUBLIC_API_ORIGIN + url.slice(SUPABASE_ORIGIN.length) : url) as T;
}

let installed = false;

/** Patches storage URL builders once, so every existing call site benefits. */
export function installPublicApiDomain() {
  if (installed || !PUBLIC_API_DOMAIN_ENABLED) return;
  installed = true;
  try {
    const proto = Object.getPrototypeOf(supabase.storage.from("__probe__"));
    const origSigned = proto.createSignedUrl;
    const origSignedMany = proto.createSignedUrls;
    const origPublic = proto.getPublicUrl;

    if (origSigned) {
      proto.createSignedUrl = async function (...args: unknown[]) {
        const res = await origSigned.apply(this, args);
        if (res?.data?.signedUrl) res.data.signedUrl = toPublicApiUrl(res.data.signedUrl);
        return res;
      };
    }
    if (origSignedMany) {
      proto.createSignedUrls = async function (...args: unknown[]) {
        const res = await origSignedMany.apply(this, args);
        if (Array.isArray(res?.data)) {
          res.data.forEach((d: { signedUrl?: string | null }) => {
            if (d?.signedUrl) d.signedUrl = toPublicApiUrl(d.signedUrl);
          });
        }
        return res;
      };
    }
    if (origPublic) {
      proto.getPublicUrl = function (...args: unknown[]) {
        const res = origPublic.apply(this, args);
        if (res?.data?.publicUrl) res.data.publicUrl = toPublicApiUrl(res.data.publicUrl);
        return res;
      };
    }
  } catch (e) {
    // Never break the app over cosmetics — fall back to original URLs.
    console.warn("installPublicApiDomain failed, using original Supabase URLs", e);
  }
}

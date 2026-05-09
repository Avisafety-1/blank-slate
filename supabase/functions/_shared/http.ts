// SSRF-safe fetch with hardcoded allow-list of upstream hosts.
// Used by functions that proxy to third-party APIs (PT-10 remediation).

export class SSRFError extends Error {
  constructor(public host: string) {
    super(`Outbound host not allowed: ${host}`);
  }
}

/**
 * Perform a fetch only if the target host is in `allowedHosts`.
 * Hostnames are matched case-insensitively. Subdomain wildcards are NOT
 * supported — list each host explicitly.
 */
export async function safeFetch(
  url: string,
  init: RequestInit,
  allowedHosts: string[],
): Promise<Response> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SSRFError(url);
  }

  // Block non-http(s) protocols outright (file:, data:, gopher: …)
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new SSRFError(parsed.protocol);
  }

  const host = parsed.hostname.toLowerCase();
  const allow = allowedHosts.map((h) => h.toLowerCase());
  if (!allow.includes(host)) {
    throw new SSRFError(host);
  }

  return await fetch(url, init);
}

/** Mask a token for logging — keep only first 4 + last 4 chars. */
export function fingerprintToken(token: string | undefined | null): string {
  if (!token) return "<none>";
  const s = String(token);
  if (s.length <= 8) return "***";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

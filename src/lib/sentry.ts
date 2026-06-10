import * as Sentry from "@sentry/react";

const dsn =
  import.meta.env.VITE_SENTRY_DSN ||
  "https://1143658787c872b744efce0c8aea08fe@o4511049644376064.ingest.de.sentry.io/4511049650470992";

// =====================================================================
// PII-skrubber — kjører på hvert event og hver breadcrumb før det
// sendes til Sentry. Mål: fjerne epost, telefon, auth-tokens, cookies
// og signerte storage-URL-tokens uten å miste teknisk feilkontekst.
// =====================================================================

const EMAIL_RE = /\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi;
// Telefon: minst 8 sifre totalt, kan inneholde +, mellomrom, parens, bindestrek.
const PHONE_RE = /\+?\d[\d\s().-]{6,}\d/g;
const REDACTED = "[redacted]";

const SENSITIVE_HEADER_KEYS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "apikey",
  "x-supabase-auth",
  "x-api-key",
  "proxy-authorization",
]);

const SENSITIVE_FIELD_KEYS = new Set([
  "password",
  "passwd",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "session",
  "api_key",
  "apikey",
  "email",
  "e_mail",
  "phone",
  "phone_number",
  "telefon",
  "mobile",
  "mobil",
]);

/** Strip signed-URL tokens from a URL string (Supabase storage, S3, etc). */
const stripUrlTokens = (url: string): string => {
  try {
    const u = new URL(url, "http://x");
    let changed = false;
    ["token", "Signature", "X-Amz-Signature", "sig", "access_token"].forEach((k) => {
      if (u.searchParams.has(k)) {
        u.searchParams.set(k, REDACTED);
        changed = true;
      }
    });
    if (!changed) return url;
    return url.startsWith("/") ? u.pathname + u.search + u.hash : u.toString();
  } catch {
    return url;
  }
};

const scrubString = (s: string): string => {
  if (!s) return s;
  let out = s.replace(EMAIL_RE, REDACTED).replace(PHONE_RE, REDACTED);
  // Hvis hele strengen er en URL — strip tokens
  if (/^https?:\/\//i.test(out)) out = stripUrlTokens(out);
  return out;
};

const scrubValue = (value: unknown, keyHint?: string): unknown => {
  if (value == null) return value;
  if (typeof value === "string") {
    if (keyHint && SENSITIVE_FIELD_KEYS.has(keyHint.toLowerCase())) return REDACTED;
    return scrubString(value);
  }
  if (Array.isArray(value)) return value.map((v) => scrubValue(v));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const lk = k.toLowerCase();
      if (SENSITIVE_HEADER_KEYS.has(lk) || SENSITIVE_FIELD_KEYS.has(lk)) {
        out[k] = REDACTED;
      } else {
        out[k] = scrubValue(v, k);
      }
    }
    return out;
  }
  return value;
};

const scrubBreadcrumb = (
  breadcrumb: Sentry.Breadcrumb,
): Sentry.Breadcrumb | null => {
  try {
    if (breadcrumb.message) breadcrumb.message = scrubString(breadcrumb.message);
    if (breadcrumb.data) breadcrumb.data = scrubValue(breadcrumb.data) as Record<string, unknown>;
  } catch {
    // never fail breadcrumb-prosessering
  }
  return breadcrumb;
};

const scrubPii = (event: Sentry.ErrorEvent): Sentry.ErrorEvent | null => {
  try {
    // User: behold kun id (UUID), fjern alt annet
    if (event.user) {
      event.user = { id: event.user.id };
    }
    // Request: scrub headers, cookies, query/data
    if (event.request) {
      if (event.request.headers) {
        const cleaned: Record<string, string> = {};
        for (const [k, v] of Object.entries(event.request.headers)) {
          cleaned[k] = SENSITIVE_HEADER_KEYS.has(k.toLowerCase())
            ? REDACTED
            : (typeof v === "string" ? scrubString(v) : String(v));
        }
        event.request.headers = cleaned;
      }
      delete (event.request as { cookies?: unknown }).cookies;
      if (event.request.url) event.request.url = stripUrlTokens(event.request.url);
      if (event.request.query_string && typeof event.request.query_string === "string") {
        event.request.query_string = scrubString(event.request.query_string);
      }
      if (event.request.data) {
        event.request.data = scrubValue(event.request.data) as never;
      }
    }
    // Exception-meldinger
    event.exception?.values?.forEach((ex) => {
      if (ex.value) ex.value = scrubString(ex.value);
    });
    if (event.message) {
      event.message = typeof event.message === "string" ? scrubString(event.message) : event.message;
    }
    // Extra / contexts (men IKKE røre vår whitelisted "company"-context)
    if (event.extra) event.extra = scrubValue(event.extra) as Record<string, unknown>;
    if (event.contexts) {
      const safe: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(event.contexts)) {
        if (k === "company") safe[k] = v; // whitelistet
        else safe[k] = scrubValue(v);
      }
      event.contexts = safe as never;
    }
    // Breadcrumbs (browserintegrasjoner kan ha lagt på fetch/xhr-data)
    if (event.breadcrumbs) {
      event.breadcrumbs = event.breadcrumbs
        .map((b) => scrubBreadcrumb(b))
        .filter((b): b is Sentry.Breadcrumb => b != null);
    }
  } catch (err) {
    // Skrubber-feil skal aldri stoppe rapportering
    console.warn("[sentry] scrubPii failed", err);
  }
  return event;
};

// =====================================================================
// Init
// =====================================================================

const appRelease =
  (import.meta.env.VITE_APP_VERSION as string | undefined) || "dev";

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: appRelease,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    sampleRate: 1.0,
    sendDefaultPii: false,
    tracePropagationTargets: [
      "localhost",
      /^https:\/\/avisafev2\.lovable\.app/,
      /^https:\/\/app\.avisafe\.no/,
      /^https:\/\/login\.avisafe\.no/,
    ],
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications",
      "Non-Error promise rejection captured",
      "Failed to fetch",
      "Load failed",
      "NetworkError when attempting to fetch",
      "AbortError",
    ],
    denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],
    beforeSend(event) {
      return scrubPii(event as Sentry.ErrorEvent);
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubBreadcrumb(breadcrumb);
    },
    enabled: !!dsn,
  });
}

// =====================================================================
// Helpers for manuell rapportering med ekstra feature/action-tags
// =====================================================================

export interface CaptureContext {
  /** F.eks. "missions", "map3d", "sora", "documents" */
  feature?: string;
  /** F.eks. "save_mission", "import_kml", "webgl_context_lost" */
  action?: string;
  /** Tilleggsdata — kjøres gjennom PII-scrub før send */
  extra?: Record<string, unknown>;
  /** Nivå (default: "error") */
  level?: Sentry.SeverityLevel;
}

export const captureWithContext = (err: unknown, ctx: CaptureContext = {}) => {
  Sentry.withScope((scope) => {
    if (ctx.feature) scope.setTag("feature", ctx.feature);
    if (ctx.action) scope.setTag("action", ctx.action);
    if (ctx.extra) scope.setContext("extra", ctx.extra);
    if (ctx.level) scope.setLevel(ctx.level);
    Sentry.captureException(err);
  });
};

export const captureMessageWithContext = (
  message: string,
  ctx: CaptureContext = {},
) => {
  Sentry.withScope((scope) => {
    if (ctx.feature) scope.setTag("feature", ctx.feature);
    if (ctx.action) scope.setTag("action", ctx.action);
    if (ctx.extra) scope.setContext("extra", ctx.extra);
    Sentry.captureMessage(message, ctx.level ?? "info");
  });
};

export { Sentry };

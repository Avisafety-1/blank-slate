
# Plan: Sentry-kontekst med bruker, selskap og PII-vern

Mål: når en feil skjer, skal vi i Sentry kunne se hvilken bruker (anonymisert), hvilket selskap, hvilken rolle, hvilken rute og hvilken app-versjon — uten å lekke epost, telefon eller andre persondata.

Alle endringer er **frontend-only**. Ingen DB-endringer, ingen edge functions, ingen funksjonelle endringer.

---

## 1. Hardene `src/lib/sentry.ts` (PII-vern + release)

Oppdater `Sentry.init` med PII-sikre defaults og en `beforeSend`-skrubber.

```ts
Sentry.init({
  dsn,
  environment: import.meta.env.MODE,
  release: import.meta.env.VITE_APP_VERSION || "unknown",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.httpClientIntegration(),
    Sentry.captureConsoleIntegration({ levels: ["error"] }),
  ],
  tracesSampleRate: 0.1,
  sampleRate: 1.0,
  sendDefaultPii: false,            // explisitt av
  tracePropagationTargets: ["localhost", /^https:\/\/avisafev2\.lovable\.app/, /^https:\/\/app\.avisafe\.no/],
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "Non-Error promise rejection captured",
    "Failed to fetch",                 // nettverksfeil håndteres egne steder
    "Load failed",                     // Safari-variant
    "NetworkError when attempting to fetch",
  ],
  denyUrls: [/extensions\//i, /^chrome:\/\//i, /^moz-extension:\/\//i],
  beforeSend(event) {
    return scrubPii(event);            // se §4
  },
  beforeBreadcrumb(breadcrumb) {
    return scrubBreadcrumb(breadcrumb); // se §4
  },
  enabled: !!dsn,
});
```

Custom domains (`app.avisafe.no`, `login.avisafe.no`) legges til i `tracePropagationTargets`.

## 2. Sett bruker/selskaps-kontekst fra AuthContext

Ny hook `src/hooks/useSentryContext.ts` som monteres én gang i `AuthProvider` (eller i `App.tsx` rett under `<AuthProvider>`). Den lytter på endringer i `user`, `companyId`, `companyType`, `userRole` og oppdaterer Sentry-scopet:

```ts
useEffect(() => {
  if (!user) {
    Sentry.setUser(null);
    Sentry.setTags({ company_id: undefined, company_type: undefined, user_role: undefined });
    return;
  }
  Sentry.setUser({
    id: user.id,                       // UUID — ikke PII
    // BEVISST IKKE: email, username, ip_address, phone
  });
  Sentry.setTags({
    company_id: companyId ?? "none",
    company_type: companyType ?? "none",
    user_role: userRole ?? "none",
  });
  Sentry.setContext("company", companyId ? {
    id: companyId,
    name: companyName,                 // selskapsnavn er forretningsdata, ikke personlig PII
    type: companyType,
  } : null);
}, [user?.id, companyId, companyName, companyType, userRole]);
```

`companyName` regnes som ikke-PII (forretningsdata om abonnenten, ikke en fysisk person). Hvis dere vil være ekstra forsiktige kan vi droppe `setContext("company")` og bare beholde `companyId` — si fra om dere foretrekker det.

## 3. Rute-tag + nyttige breadcrumbs

Liten komponent `<SentryRouteTracker />` i `App.tsx` (inne i `BrowserRouter`):

```ts
const location = useLocation();
useEffect(() => {
  Sentry.setTag("route", location.pathname);
  Sentry.addBreadcrumb({
    category: "navigation",
    message: location.pathname,
    level: "info",
  });
}, [location.pathname]);
```

Andre nyttige breadcrumbs vi får "gratis" via integrasjonene som allerede er på (`browserTracing`, `console`, `httpClient`): fetch/XHR-feil, console.error.

## 4. PII-skrubber (`scrubPii` + `scrubBreadcrumb`)

Felles helper i `sentry.ts`. Forventer å treffe:

- `event.user.email`, `event.user.username`, `event.user.ip_address` → slett
- `event.request.cookies`, `event.request.headers.Authorization`, `apikey`, `x-supabase-auth` → slett
- I `breadcrumb.data` (særlig `fetch`/`xhr`): fjern `Authorization`, `apikey`, query/body som matcher epost-regex (`/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi`) eller telefon-regex (`/\+?\d[\d\s().-]{7,}\d/g`) → erstatt med `[redacted]`.
- I `event.exception.values[].value` og `event.message`: kjør samme regex-erstatning så stack-traces ikke lekker.
- Strip Supabase storage signed-URL tokens (`?token=...`) fra URL-er.

Hvitlistet: `event.user.id` (UUID), `event.tags.company_id`, `event.contexts.company`.

## 5. Berik manuelle `captureException`-kall

Liten wrapper `captureWithContext(err, extras)` i `sentry.ts` som setter feature-tag på det enkelte eventet uten å forurense globalt scope:

```ts
export const captureWithContext = (err: unknown, opts: {
  feature?: string;        // f.eks. "missions", "map3d", "sora"
  action?: string;         // f.eks. "save_mission", "import_kml"
  extra?: Record<string, unknown>;
}) => {
  Sentry.withScope((scope) => {
    if (opts.feature) scope.setTag("feature", opts.feature);
    if (opts.action) scope.setTag("action", opts.action);
    if (opts.extra) scope.setContext("extra", opts.extra);
    Sentry.captureException(err);
  });
};
```

**Ingen mass-refactor i denne planen** — vi tar den i bruk gradvis i nye/oppdaterte filer. Eksisterende `Sentry.captureException(err, { tags: {...} })` (f.eks. Map3D) fortsetter å virke.

## 6. ErrorBoundary-berikelse

`src/components/ErrorBoundary.tsx` (eksisterende): pakk inn med `Sentry.ErrorBoundary` eller legg til `Sentry.captureException` med `withScope` som setter `tag: { boundary: "root" }` og `context: { componentStack }`. Beholder eksisterende fallback-UI.

## 7. App-versjon i release-tag

I `vite.config.ts`: injiser `VITE_APP_VERSION` fra `package.json` version + git commit hash (kort). Trengs for å koble feil til en spesifikk deploy. Hvis ikke build-pipeline har commit-hash tilgjengelig, faller vi tilbake til kun `package.json` version.

```ts
// vite.config.ts
import { execSync } from "node:child_process";
const commit = (() => { try { return execSync("git rev-parse --short HEAD").toString().trim(); } catch { return "dev"; } })();
define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(`${pkg.version}+${commit}`) }
```

## 8. (Valgfritt — krever bekreftelse) Session Replay

Sentry Session Replay kan vise nøyaktig hva brukeren gjorde rett før feilen. Den **kan** maskere PII automatisk (`maskAllText: true`, `blockAllMedia: true`). Likevel: replays er tunge og lagring koster. **Foreslår å ikke aktivere nå** — gi beskjed hvis dere vil ha det, så legger jeg det inn med strengeste masking.

---

## Berørte filer

- `src/lib/sentry.ts` — init + scrubber + `captureWithContext`
- `src/hooks/useSentryContext.ts` — ny
- `src/contexts/AuthContext.tsx` — kall `useSentryContext()` én gang (eller bruk i App.tsx)
- `src/App.tsx` — `<SentryRouteTracker />`
- `src/components/ErrorBoundary.tsx` — withScope-berikelse
- `vite.config.ts` — release-versjon

## Ikke berørt

- DB, RLS, edge functions
- Auth-flyt, login/logout
- Eksisterende `captureException`-kall (bakoverkompatible)

## Verifisering

1. Build passerer.
2. Logg inn → trigger en testfeil (f.eks. `throw` i en komponent eller `Sentry.captureMessage("test", "info")` fra konsoll). I Sentry-dashboardet skal eventet ha:
   - `user.id` = UUID (ingen epost)
   - tags: `company_id`, `company_type`, `user_role`, `route`, `feature` (hvis satt)
   - context: `company` med id/name/type
   - release: `1.x.x+<hash>`
3. Skrubber: send et event med `Authorization: Bearer eyJ...` i breadcrumb → bekreft at headeren ikke finnes i Sentry-payload.
4. Logg ut → bekreft at neste event har `user: null`.

## Personvern-oppsummering

| Felt | Sendes til Sentry? |
|------|-------------------|
| user.id (UUID) | Ja |
| Epost | Nei (skrubbet) |
| Telefonnummer | Nei (skrubbet) |
| IP-adresse | Nei (`sendDefaultPii: false`) |
| Cookies / Authorization-headere | Nei (skrubbet) |
| companyId / companyType / userRole | Ja (forretningskontekst) |
| companyName | Ja (kan tas ut hvis ønsket) |
| Rute (pathname) | Ja |
| App-versjon / commit | Ja |

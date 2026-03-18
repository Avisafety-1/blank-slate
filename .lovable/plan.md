

## Plan: Oppdater Sentry-konfigurasjon

Sentry er allerede installert og konfigurert. To endringer trengs:

### 1. Legg til `browserTracingIntegration` i `src/lib/sentry.ts`
- Legg til `integrations: [Sentry.browserTracingIntegration()]` i `Sentry.init()`
- Legg til `tracePropagationTargets: ["localhost", /^https:\/\/avisafev2\.lovable\.app/]` for distributed tracing mot egen app-URL

### 2. Fiks TypeScript-feil i `src/components/ErrorBoundary.tsx`
- Bytt `Sentry.captureException(error, { extra: ... })` til den nye v10 API-metoden, eller bruk en type-safe fallback:
  ```ts
  (Sentry as any).captureException(error, { extra: { componentStack: errorInfo.componentStack } });
  ```
  Alternativt, om `captureReactException` finnes i SDK-en: bruk den.

### Filer som endres
| Fil | Endring |
|-----|---------|
| `src/lib/sentry.ts` | Legg til `browserTracingIntegration` + `tracePropagationTargets` |
| `src/components/ErrorBoundary.tsx` | Fiks `captureException` type-feil |


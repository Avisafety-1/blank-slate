import * as Sentry from "@sentry/react";

const dsn = import.meta.env.VITE_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    // Only send 10% of transactions for performance monitoring
    tracesSampleRate: 0.1,
    // Capture 100% of errors
    sampleRate: 1.0,
    // Don't send in development unless DSN is explicitly set
    enabled: !!dsn,
  });
}

export { Sentry };

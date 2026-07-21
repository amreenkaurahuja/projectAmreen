import * as Sentry from "@sentry/nextjs";

// Runs after the HTML document loads, before hydration. An unset
// NEXT_PUBLIC_SENTRY_DSN makes this a safe no-op.
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});

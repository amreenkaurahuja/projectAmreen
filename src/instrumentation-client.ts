import * as Sentry from "@sentry/nextjs";
import { isSentryEnabled } from "@/lib/observability/sentry-enablement";

// Runs after the HTML document loads, before hydration. Sentry is prepared
// here but stays inert unless NEXT_PUBLIC_SENTRY_ENABLED is explicitly
// "true" — see src/lib/observability/sentry-enablement.ts.
if (isSentryEnabled(process.env, "NEXT_PUBLIC_SENTRY_ENABLED")) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}

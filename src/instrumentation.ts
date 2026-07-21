import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";
import { isSentryEnabled } from "@/lib/observability/sentry-enablement";

// Runs once per server instance (Node or Edge runtime) before it accepts
// requests. Sentry is prepared here but stays inert unless SENTRY_ENABLED
// is explicitly "true" — see src/lib/observability/sentry-enablement.ts.
// This project doesn't require a live Sentry project to build or run.
export async function register() {
  if (!isSentryEnabled(process.env, "SENTRY_ENABLED")) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.APP_ENV ?? "development",
    tracesSampleRate: 0.1,
  });
}

// Reports server-side rendering/route-handler errors Next.js catches
// internally (ones that never reach a route handler's own try/catch, e.g. a
// throw during request setup) to Sentry, tagged with the route/context Next
// provides.
export const onRequestError: Instrumentation.onRequestError =
  Sentry.captureRequestError;

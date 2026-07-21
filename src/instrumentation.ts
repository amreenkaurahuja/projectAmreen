import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";

// Runs once per server instance (Node or Edge runtime) before it accepts
// requests. Sentry.init with an unset SENTRY_DSN is a safe no-op — this
// project doesn't require a live Sentry project to build or run.
export async function register() {
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

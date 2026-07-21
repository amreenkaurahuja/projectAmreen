/**
 * Sentry is prepared but deliberately not fully integrated yet: it only
 * initializes when explicitly opted into via an env var, so deploying
 * without configuring Sentry has zero effect on behavior. Requiring an
 * explicit flag (rather than just "a DSN happens to be set") makes that
 * inert-by-default state unambiguous.
 */
export function isSentryEnabled(
  env: Record<string, string | undefined>,
  flagName: "SENTRY_ENABLED" | "NEXT_PUBLIC_SENTRY_ENABLED",
): boolean {
  return env[flagName] === "true";
}

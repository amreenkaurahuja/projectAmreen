# Coding Standards

## Before pushing

```bash
npm run validate
```

Runs, in order: `format:check`, `lint`, `typecheck`, `test:coverage`, `build`. This matches exactly what the `quality` job in `.github/workflows/ci.yml` runs on every PR (a separate `e2e` job runs Playwright after it) — `validate` uses `test:coverage`, not plain `test`, specifically so a local pass actually predicts a CI pass instead of missing the coverage-threshold gate. Both `quality` and `e2e` are required status checks on `main` — a PR can't merge until they're green. Fix failures locally before pushing; don't rely on CI to discover them first.

A Husky pre-commit hook (`.husky/pre-commit`) also runs on every `git commit`: `npx lint-staged` (Prettier + `eslint --fix`, scoped to staged files only) followed by the full `npm run lint` and `npm run typecheck`. This catches most issues before they're even pushed. Don't bypass it with `git commit --no-verify` to work around a real failure — fix the failure.

## TypeScript

- `strict: true`. No `any` — if a Supabase query result needs a shape TypeScript can't infer, define a `Raw*Row` interface for it and cast once at the query boundary (see any `*.repository.ts` for the pattern), not `any` scattered through the code that consumes it.
- Path alias `@/*` → `src/*`. Use it instead of relative `../../..` chains.
- Prefer a named interface per shape over inline object types once it's used in more than one place.

## Linting & formatting

- ESLint config: `eslint-config-next` (core-web-vitals + typescript), run with `--max-warnings=0` — a warning fails CI exactly like an error. Don't suppress a rule with an inline disable comment unless the alternative is genuinely worse; prefer fixing the underlying issue.
- Prettier (with `prettier-plugin-tailwindcss` for class-order sorting) is the only source of formatting truth. Run `npm run format` rather than hand-formatting; don't argue with it in review.

## Module layout (`src/modules/<domain>/`)

Follow the existing `missions` domain as the template for any new domain:

| file                           | contains                                                                                                                  | may import Supabase? |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `*.types.ts`                   | plain interfaces/types describing the domain's data                                                                       | no                   |
| `*.calculations.ts` (optional) | pure functions derived from the domain's types — no side effects, no I/O                                                  | no                   |
| `*.repository.ts`              | an interface + a `Supabase*Repository` class implementing it; the only place `supabase.from(...)` appears for this domain | yes                  |
| `*.service.ts`                 | business rules; depends on the repository **interface**, constructed via dependency injection in the caller               | no                   |

Rules that follow from this:

- A `*.service.ts` never imports a concrete `Supabase*Repository` class, only its interface — this is what makes it unit-testable with a hand-built fake, no test database required.
- A `*.calculations.ts` file must stay importable from a `"use client"` component without pulling in `@supabase/supabase-js` transitively. If you need a DB call to compute something, that's a service concern, not a calculations concern.
- Pages/route handlers do the wiring (`new SupabaseXRepository(supabase)`, `new XService(repository)`) and nothing else domain-specific — no inline `supabase.from(...)` for data a service already knows how to fetch.
- Reuse before duplicating: `mission-completion.service.ts` composes `MissionPlayerService` rather than re-querying mission data itself; the client completion screen imports the same `mission-completion.calculations.ts` functions the server-rendered review page uses, so accuracy/score-message logic is computed identically in exactly one place.

## Error handling

- Domain errors are typed exception classes, not string codes: `MissionRepositoryError` as the base, with `MissionAccessError`, `MissionNotFoundError`, `MissionDuplicateError`, `MissionQuestionBankError`, `MissionOptionInvalidError` extending it per failure mode. Repositories throw these; services propagate them; routes/pages `catch` and map to the right HTTP status or `redirect()`/`notFound()`. Don't throw a bare `Error` from a repository/service if a typed one already exists for that case.
- A repository only wraps a real Postgrest `error` — never swallow it silently and return `null`/`[]`, since that hides real failures as "no data".

## Observability

- Every `/api/**` route handler is exported wrapped in `withApiObservability("<METHOD> <path>", handler)` (`src/lib/observability/api.ts`) — request id assignment/propagation, structured start/completion logs, and a safety-net 500+Sentry-report for anything that escapes the route's own error handling all come from the wrapper, not from each route reimplementing it.
- Use `logger.info/warn/error(message, context)` from `src/lib/observability/logger.ts` for structured logs — never a bare `console.log`. `message` should be a short, stable, dot-namespaced string (`api.missions.attempts.failed`), not a one-off sentence; put the variable detail in `context`.
- Only report genuinely unexpected failures to Sentry (`Sentry.captureException`) — a route's own generic-500 branch is the right place, not its 400/401/403/404 branches. Sentry noise from expected client errors makes real regressions harder to spot.
- `Sentry.init` in `src/instrumentation.ts`/`instrumentation-client.ts` is a safe no-op without `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` set — don't add code that assumes Sentry is actually configured (e.g. don't gate real functionality behind whether an event successfully sent).

## Validation at boundaries

- Every ID that arrives from a URL (`searchParams`, a dynamic route segment, or a request body) and is expected to be a UUID is validated with Zod (`z.string().uuid()`) **before** it's used in a Supabase query. Postgrest throws on malformed UUID syntax, and an uncaught throw becomes a raw 500 instead of a clean 400/404/redirect. This has caused a real production incident (see `docs/ReleaseNotes.md`) — treat it as a hard rule, not a style preference.
- Request bodies are validated with a Zod schema (see `learnerSchema`, the attempts route's `bodySchema`) — never destructure untrusted JSON directly into a query.

## Testing

- **Unit tests** (`tests/unit/*.test.ts(x)`, Vitest): services are tested against a hand-built object implementing the repository interface (see `buildRepository(overrides)` helpers throughout `tests/unit/mission-player-service.test.ts` and friends) — no real Supabase calls. Route handlers are tested by `vi.doMock`-ing `@/lib/supabase/server` and, where needed, the service module itself, then dynamically `import()`-ing the route so the mock takes effect (`vi.resetModules()` in `beforeEach`). Client components are tested with `@testing-library/react`.
- **Coverage thresholds** are configured in `vitest.config.ts` (80% statements/functions/lines, 70% branches) and enforced by `npm run test:coverage`. Note: `npm test` (used in CI's `quality` job and in `npm run validate`) does **not** enforce them — only `test:coverage` does. There is a known pre-existing gap below threshold, mostly in server component pages and `catalogue.ts`; closing it is tracked separately (see `docs/Roadmap.md`), not something every PR is expected to fix.
- **Regression tests get a comment explaining the bug**, not just the assertion — see `mission-resume-regression.test.ts` or `mission-player-repository.test.ts`'s RLS-embed test for the pattern: a short comment above the `describe`/`it` block naming the real incident and why the test would have caught it.
- **E2E tests** (`tests/e2e/*.spec.ts`, Playwright) exercise the full authenticated flow against a real (non-production) Supabase project and are skipped automatically unless `E2E_LEARNER_EMAIL`/`E2E_LEARNER_PASSWORD` are set — see `docs/PHASE3A_SETUP.md`.

## Security

- Never read or reference `SUPABASE_SERVICE_ROLE_KEY` from anything under `src/` — it's seed-script-only (`scripts/`). If a new script needs it, validate it through `scripts/env.ts`'s pattern, not ad hoc `process.env` access.
- Never expose the correct answer or explanation for a mission item the learner hasn't answered yet — check this explicitly for any new endpoint that returns question data (see the mission-player and mission-completion tests for the pattern: build a fixture with an unanswered item and assert its answer key is absent from the response).
- RLS is the backstop, not the only check: still enforce ownership explicitly in the repository/service layer so failures surface as clean 403s/redirects instead of empty-but-200 responses.

## Git

- Branch model: `main` (protected — PR + passing `quality`/`e2e` checks required, no direct pushes) ← `develop` ← `feature/*`.
- Commit messages: imperative summary line (`fix:`, `feat:`, `debug:` prefixes are used loosely, not enforced by tooling), body explains _why_ when the fix isn't self-evident from the diff — see the mission-player resume fix commits for the level of detail expected on a non-obvious bug.
- Don't `git push --force` to `main` or `develop`.

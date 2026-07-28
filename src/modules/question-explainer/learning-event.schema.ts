import { z } from "zod";
import type { LearningEvent } from "./explanation-event.types";

// Mirrors explanation-event.types.ts's LearningEvent union and
// 0012_learning_events.sql's table-level CHECK constraint — each boundary
// (TypeScript type, database constraint, request schema) independently
// declares the same vocabulary, matching TDS-008's own approach of
// enforcing the same shape invariant at every layer rather than sharing
// one runtime source across them.
const EXPLANATION_STEPS = [
  "acknowledge",
  "explain",
  "worked_example",
  "next_step",
] as const;

const EXIT_METHODS = [
  "escape",
  "close_button",
  "backdrop",
  "navigation",
  "unmount",
  "error",
] as const;

const explanationStepSchema = z.enum(EXPLANATION_STEPS);
const exitMethodSchema = z.enum(EXIT_METHODS);

// .strict() on every variant: an unknown extra property (e.g. a client
// attempting to smuggle in a learnerId) fails validation rather than being
// silently dropped — matching explanation-response-validator.ts's existing
// convention.
const baseFields = {
  eventId: z.string().uuid(),
  attemptId: z.string().uuid(),
  sessionId: z.string().uuid(),
  occurredAt: z.string().datetime(),
};

const explanationOpenedEventSchema = z
  .object({
    eventType: z.literal("explanation_opened"),
    ...baseFields,
  })
  .strict();

const stepViewedEventSchema = z
  .object({
    eventType: z.literal("step_viewed"),
    ...baseFields,
    step: explanationStepSchema,
  })
  .strict();

const explanationCompletedEventSchema = z
  .object({
    eventType: z.literal("explanation_completed"),
    ...baseFields,
    durationMs: z.number().int().nonnegative(),
  })
  .strict();

const explanationAbandonedEventSchema = z
  .object({
    eventType: z.literal("explanation_abandoned"),
    ...baseFields,
    lastStep: explanationStepSchema,
    exitMethod: exitMethodSchema,
    durationMs: z.number().int().nonnegative(),
  })
  .strict();

/**
 * Deliberately has no `learnerId` field, on any variant — not "ignored if
 * present," but structurally absent from the schema, so a client attempt
 * to include one fails `.strict()` validation before the route does
 * anything else (TDS-008 §10.4: learner identity comes from
 * authentication, never the client).
 */
export const learningEventSchema: z.ZodType<LearningEvent> =
  z.discriminatedUnion("eventType", [
    explanationOpenedEventSchema,
    stepViewedEventSchema,
    explanationCompletedEventSchema,
    explanationAbandonedEventSchema,
  ]);

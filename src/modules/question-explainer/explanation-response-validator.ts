import { z } from "zod";
import type { QuestionExplanationResponse } from "./explainer.types";

// Small, hard limits from TDS-007 §13 — a backstop that rejects a response
// before it's ever rendered, not the primary control (the prompt/word-budget
// grounding check is). Mirrors ai/validation/response-validator.ts's role.
const MAX_ACKNOWLEDGEMENT_LENGTH = 120;
const MAX_MISTAKE_EXPLANATION_LENGTH = 400;
const MAX_KEY_CONCEPT_LENGTH = 500;
const MAX_PROBLEM_LENGTH = 250;
const MAX_STEPS = 5;
const MAX_STEP_LENGTH = 250;
const MAX_ANSWER_LENGTH = 150;
const MAX_NEXT_ACTION_TEXT_LENGTH = 250;

// Mirrors ai/validation/response-validator.ts's MARKDOWN_PATTERN exactly —
// duplicated rather than imported, since that file's constant is private
// and this module's schema is otherwise independent of the Coach's.
const MARKDOWN_PATTERN = /(\*\*|__|`|^#{1,6}\s|^[-*]\s|\[[^\]]+\]\([^)]+\))/m;

function plainTextField(maxLength: number) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine((value) => !MARKDOWN_PATTERN.test(value), {
      message: "must not contain markdown formatting",
    });
}

const workedExampleSchema: z.ZodType<
  QuestionExplanationResponse["workedExample"]
> = z
  .object({
    problem: plainTextField(MAX_PROBLEM_LENGTH),
    steps: z.array(plainTextField(MAX_STEP_LENGTH)).min(1).max(MAX_STEPS),
    answer: plainTextField(MAX_ANSWER_LENGTH),
  })
  .strict();

const nextActionSchema: z.ZodType<QuestionExplanationResponse["nextAction"]> = z
  .object({
    type: z.enum(["linked-question", "review-skill"]),
    text: plainTextField(MAX_NEXT_ACTION_TEXT_LENGTH),
  })
  .strict();

export const QuestionExplanationResponseSchema: z.ZodType<QuestionExplanationResponse> =
  z
    .object({
      acknowledgement: plainTextField(MAX_ACKNOWLEDGEMENT_LENGTH),
      mistakeExplanation: plainTextField(MAX_MISTAKE_EXPLANATION_LENGTH),
      keyConcept: plainTextField(MAX_KEY_CONCEPT_LENGTH),
      workedExample: workedExampleSchema,
      nextAction: nextActionSchema,
    })
    .strict();

export type ValidationResult<T> =
  { success: true; data: T } | { success: false; error: string };

/** Structural/shape validation only — content-safety and grounding rules live in explanation-grounding-validator.ts. */
export function validateQuestionExplanationResponse(
  candidate: unknown,
): ValidationResult<QuestionExplanationResponse> {
  const result = QuestionExplanationResponseSchema.safeParse(candidate);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data };
}

/** Parses the provider's raw text as JSON first — a non-JSON response (prose, markdown) fails here before schema validation even runs. */
export function parseQuestionExplanationResponseJson(
  raw: string,
): ValidationResult<QuestionExplanationResponse> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { success: false, error: "Response was not valid JSON" };
  }
  return validateQuestionExplanationResponse(parsed);
}

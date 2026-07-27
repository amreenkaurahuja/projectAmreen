import { z } from "zod";
import type { CoachResponse } from "../coach/coach.types";
import type { ValidationResult } from "./dto-validator";

// Small, hard limits — the prompt is responsible for the audience word
// counts (80 words learner / 160 words parent); these are a backstop that
// rejects a response before it's ever rendered, not the primary control.
const MAX_HEADLINE_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 900;
const MAX_LIST_ITEMS = 3;
const MAX_LIST_ITEM_LENGTH = 160;
const MAX_DISCLAIMER_LENGTH = 200;

// Markdown must never appear — Gemini is asked for plain text inside JSON
// fields, never prose formatting. Catches bold/italic/code markers, ATX
// headings and bullet lists at the start of a line, and markdown links.
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

export const CoachResponseSchema: z.ZodType<CoachResponse> = z
  .object({
    headline: plainTextField(MAX_HEADLINE_LENGTH),
    message: plainTextField(MAX_MESSAGE_LENGTH),
    strengths: z
      .array(plainTextField(MAX_LIST_ITEM_LENGTH))
      .max(MAX_LIST_ITEMS),
    focusAreas: z
      .array(plainTextField(MAX_LIST_ITEM_LENGTH))
      .max(MAX_LIST_ITEMS),
    nextSteps: z
      .array(plainTextField(MAX_LIST_ITEM_LENGTH))
      .max(MAX_LIST_ITEMS),
    disclaimer: plainTextField(MAX_DISCLAIMER_LENGTH).nullable(),
  })
  .strict();

/** Structural/shape validation only — content-safety rules (banned phrases, percentages) live in grounding-validator.ts. */
export function validateCoachResponse(
  candidate: unknown,
): ValidationResult<CoachResponse> {
  const result = CoachResponseSchema.safeParse(candidate);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data };
}

/** Parses the provider's raw text as JSON first — a non-JSON response (prose, markdown) fails here before schema validation even runs. */
export function parseCoachResponseJson(
  raw: string,
): ValidationResult<CoachResponse> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { success: false, error: "Response was not valid JSON" };
  }
  return validateCoachResponse(parsed);
}

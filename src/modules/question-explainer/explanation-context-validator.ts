import { z } from "zod";
import { AUDIENCES } from "@/modules/ai/coach/audiences";
import {
  EXPLANATION_CONTEXT_SCHEMA_VERSION,
  type QuestionExplanationContext,
} from "./explainer.types";

const MAX_NAME_LENGTH = 120;
const MAX_TEXT_LENGTH = 1000;
// Matches question_bank.explanation's own DB check constraint
// (char_length <= 1500) — an authored explanation over that length would
// mean the DB constraint itself was violated, which is a bug to surface,
// not silently truncate.
const MAX_EXPLANATION_LENGTH = 1500;

export type ValidationResult<T> =
  { success: true; data: T } | { success: false; error: string };

export const QuestionExplanationContextSchema: z.ZodType<QuestionExplanationContext> =
  z
    .object({
      schemaVersion: z.literal(EXPLANATION_CONTEXT_SCHEMA_VERSION),
      promptVersion: z.string().min(1).max(40),
      audience: z.enum(AUDIENCES),
      learnerDisplayName: z.string().min(1).max(MAX_NAME_LENGTH),
      subject: z.string().min(1).max(MAX_NAME_LENGTH),
      skill: z.string().min(1).max(MAX_NAME_LENGTH),
      prompt: z.string().min(1).max(MAX_TEXT_LENGTH),
      learnerAnswerLabel: z.string().min(1).max(MAX_TEXT_LENGTH),
      correctAnswerLabel: z.string().min(1).max(MAX_TEXT_LENGTH),
      // Not .min(1): question_bank.explanation defaults to '' in the DB, and
      // an authored explanation genuinely being missing is a real, expected
      // case the fallback builder handles, not invalid.
      authoredExplanation: z.string().max(MAX_EXPLANATION_LENGTH),
      followUpAvailable: z.boolean(),
      followUpQuestionPrompt: z.string().min(1).max(MAX_TEXT_LENGTH).optional(),
    })
    .strict()
    .refine(
      (context) =>
        context.followUpAvailable ||
        context.followUpQuestionPrompt === undefined,
      {
        message:
          "followUpQuestionPrompt must be omitted when followUpAvailable is false",
      },
    );

/** The one gate before a QuestionExplanationContext is used by anything downstream (the fallback builder, or a prompt builder/gateway call from Stage 2 on). */
export function validateQuestionExplanationContext(
  candidate: unknown,
): ValidationResult<QuestionExplanationContext> {
  const result = QuestionExplanationContextSchema.safeParse(candidate);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data };
}

import type {
  QuestionExplanationContext,
  QuestionExplanationNextAction,
  QuestionExplanationResponse,
} from "./explainer.types";

/**
 * Builds a full, useful explanation directly from the DTO — zero AI
 * involvement. Used whenever AI is disabled/unconfigured, over budget, or a
 * provider/response-validation/grounding failure occurs (Rule 9, Rule 14) —
 * and, until Stage 2 shipped, for every request unconditionally.
 *
 * Produces the same QuestionExplanationResponse shape a validated AI
 * response does, so a caller never needs to know which path produced it
 * (mirrors ai/coach/fallback-coach.ts's relationship to CoachResponse).
 * Unlike the AI path, this never invents a genuinely different worked
 * example — it cannot verify novel arithmetic is correct (see TDS-007's
 * Stage 0 audit finding on worked-example risk), so its workedExample
 * deliberately reuses the original question rather than fabricate a new
 * one. That's a real, intentional difference from what a grounded AI
 * response is allowed to do, not a shortcut.
 *
 * The authored explanation (question_bank.explanation) is never returned
 * unchanged — it's treated as trusted source material and folded into the
 * same structure the AI produces, so the UI contract doesn't change once
 * AI is switched on.
 */
export function buildDeterministicExplanation(
  context: QuestionExplanationContext,
): QuestionExplanationResponse {
  return context.audience === "learner"
    ? buildLearnerExplanation(context)
    : buildParentExplanation(context);
}

function hasAuthoredExplanation(context: QuestionExplanationContext): boolean {
  return context.authoredExplanation.trim().length > 0;
}

function buildNextAction(
  context: QuestionExplanationContext,
  linkedText: string,
  reviewText: string,
): QuestionExplanationNextAction {
  return context.followUpAvailable
    ? { type: "linked-question", text: linkedText }
    : { type: "review-skill", text: reviewText };
}

function buildLearnerExplanation(
  context: QuestionExplanationContext,
): QuestionExplanationResponse {
  const authored = hasAuthoredExplanation(context);

  return {
    acknowledgement: "Good try — let's work through this one together.",
    mistakeExplanation: `You chose "${context.learnerAnswerLabel}". The correct answer is "${context.correctAnswerLabel}".`,
    keyConcept: authored
      ? context.authoredExplanation
      : `This question is about ${context.skill}.`,
    workedExample: {
      problem: context.prompt,
      steps: [`The correct answer is "${context.correctAnswerLabel}".`],
      answer: context.correctAnswerLabel,
    },
    nextAction: buildNextAction(
      context,
      `Try another question on ${context.skill}.`,
      `Review ${context.skill} again soon.`,
    ),
  };
}

function buildParentExplanation(
  context: QuestionExplanationContext,
): QuestionExplanationResponse {
  const authored = hasAuthoredExplanation(context);

  return {
    acknowledgement: `${context.learnerDisplayName} gave this one a good try.`,
    mistakeExplanation: `${context.learnerDisplayName} selected "${context.learnerAnswerLabel}" for a ${context.skill} question; the correct answer was "${context.correctAnswerLabel}".`,
    keyConcept: authored
      ? context.authoredExplanation
      : `This question covers ${context.skill} in ${context.subject}.`,
    workedExample: {
      problem: context.prompt,
      steps: [`The correct answer is "${context.correctAnswerLabel}".`],
      answer: context.correctAnswerLabel,
    },
    nextAction: buildNextAction(
      context,
      `A follow-up question on ${context.skill} is ready to try.`,
      `Consider revisiting ${context.skill} together soon.`,
    ),
  };
}

import type { FollowUpQuestion } from "@/modules/adaptive-learning/follow-up-selector";
import type {
  DeterministicExplanation,
  QuestionExplanationContext,
  QuestionExplanationNextAction,
} from "./explainer.types";

/**
 * Builds a full, useful explanation directly from the DTO — zero AI
 * involvement. Used for every Stage 1 request (there is no gateway yet) and,
 * from Stage 2, whenever AI is disabled or a provider/validation/grounding
 * failure occurs, matching the Coach's fallback-coach.ts precedent (Rule 9).
 *
 * The authored explanation (question_bank.explanation) is never returned
 * unchanged — see TDS-007 Stage 1's fallback refinement: it's treated as
 * trusted source material and folded into the same five-part learner-facing
 * structure the AI will eventually produce, so the UI contract doesn't
 * change once AI is switched on.
 */
export function buildDeterministicExplanation(
  context: QuestionExplanationContext,
  followUp: FollowUpQuestion | null,
): DeterministicExplanation {
  return context.audience === "learner"
    ? buildLearnerExplanation(context, followUp)
    : buildParentExplanation(context, followUp);
}

function hasAuthoredExplanation(context: QuestionExplanationContext): boolean {
  return context.authoredExplanation.trim().length > 0;
}

function buildNextAction(
  followUp: FollowUpQuestion | null,
  skill: string,
  linkedText: string,
  reviewText: string,
): QuestionExplanationNextAction {
  return followUp
    ? {
        type: "linked-question",
        text: linkedText,
        questionId: followUp.questionId,
      }
    : { type: "review-skill", text: reviewText.replace("{skill}", skill) };
}

function buildLearnerExplanation(
  context: QuestionExplanationContext,
  followUp: FollowUpQuestion | null,
): DeterministicExplanation {
  const authored = hasAuthoredExplanation(context);

  return {
    acknowledgement: "Good try — let's work through this one together.",
    whatHappened: `You chose "${context.learnerAnswerLabel}". The correct answer is "${context.correctAnswerLabel}".`,
    keyConcept: authored
      ? context.authoredExplanation
      : `This question is about ${context.skill}.`,
    workedExplanation: `For this question, the correct answer is "${context.correctAnswerLabel}".`,
    nextAction: buildNextAction(
      followUp,
      context.skill,
      `Try another question on ${context.skill}.`,
      "Review {skill} again soon.",
    ),
    source: authored ? "authored" : "generic",
  };
}

function buildParentExplanation(
  context: QuestionExplanationContext,
  followUp: FollowUpQuestion | null,
): DeterministicExplanation {
  const authored = hasAuthoredExplanation(context);

  return {
    acknowledgement: `${context.learnerDisplayName} gave this one a good try.`,
    whatHappened: `${context.learnerDisplayName} selected "${context.learnerAnswerLabel}" for a ${context.skill} question; the correct answer was "${context.correctAnswerLabel}".`,
    keyConcept: authored
      ? context.authoredExplanation
      : `This question covers ${context.skill} in ${context.subject}.`,
    workedExplanation: `The correct answer to this question is "${context.correctAnswerLabel}".`,
    nextAction: buildNextAction(
      followUp,
      context.skill,
      `A follow-up question on ${context.skill} is ready to try.`,
      "Consider revisiting {skill} together soon.",
    ),
    source: authored ? "authored" : "generic",
  };
}

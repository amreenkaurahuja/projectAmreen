import type { QuestionExplanationContext } from "./explainer.types";
import {
  buildSystemPrompt,
  buildUserPrompt,
  QUESTION_EXPLANATION_RESPONSE_JSON_SCHEMA,
  type PromptBuild,
} from "./explanation-prompt-shared";

const LEARNER_MAX_WORDS = 250;

const LEARNER_AUDIENCE_RULES = [
  "Write directly to the learner, in a warm, encouraging, age-appropriate tone.",
  `Keep the entire response under ${LEARNER_MAX_WORDS} words in total.`,
  "The worked example must use different values from the original question but demonstrate the same concept, and must be mathematically correct. Never reuse the original question's exact wording.",
  'Set nextAction.type to "linked-question" and reference the follow-up naturally in nextAction.text only if a follow-up question was supplied in the context; otherwise set nextAction.type to "review-skill".',
];

/** Builds the learner-audience prompt. Throws if given a context built for a different audience. */
export function buildLearnerPrompt(
  context: QuestionExplanationContext,
): PromptBuild {
  if (context.audience !== "learner") {
    throw new Error(
      `buildLearnerPrompt requires a "learner" audience context, got "${context.audience}"`,
    );
  }

  return {
    systemPrompt: buildSystemPrompt(LEARNER_AUDIENCE_RULES),
    userPrompt: buildUserPrompt(context),
    responseSchema: QUESTION_EXPLANATION_RESPONSE_JSON_SCHEMA,
  };
}

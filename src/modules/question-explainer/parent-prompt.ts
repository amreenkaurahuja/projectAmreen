import type { QuestionExplanationContext } from "./explainer.types";
import {
  buildSystemPrompt,
  buildUserPrompt,
  QUESTION_EXPLANATION_RESPONSE_JSON_SCHEMA,
  type PromptBuild,
} from "./explanation-prompt-shared";

const PARENT_MAX_WORDS = 250;

const PARENT_AUDIENCE_RULES = [
  "Write to the parent about their child's mistake, in a warm, informative tone, referring to the child by the name given in the context.",
  `Keep the entire response under ${PARENT_MAX_WORDS} words in total.`,
  "Distinguish clearly between what was observed (the specific answer given) and a cautious, evidence-bounded interpretation. Never claim a permanent weakness, a diagnosis, or a learning difficulty.",
  "The worked example must use different values from the original question but demonstrate the same concept, and must be mathematically correct. Never reuse the original question's exact wording.",
  'Set nextAction.type to "linked-question" only if a follow-up question was supplied in the context; otherwise set nextAction.type to "review-skill".',
];

/** Builds the parent-audience prompt. Throws if given a context built for a different audience. */
export function buildParentPrompt(
  context: QuestionExplanationContext,
): PromptBuild {
  if (context.audience !== "parent") {
    throw new Error(
      `buildParentPrompt requires a "parent" audience context, got "${context.audience}"`,
    );
  }

  return {
    systemPrompt: buildSystemPrompt(PARENT_AUDIENCE_RULES),
    userPrompt: buildUserPrompt(context),
    responseSchema: QUESTION_EXPLANATION_RESPONSE_JSON_SCHEMA,
  };
}

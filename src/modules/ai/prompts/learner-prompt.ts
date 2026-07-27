import type { LearnerCoachingContext } from "../coach/coach.types";
import { COACH_RESPONSE_JSON_SCHEMA } from "./coach-response-schema";
import {
  buildSystemPrompt,
  buildUserPrompt,
  type PromptBuild,
} from "./prompt-shared";

const LEARNER_MAX_WORDS = 80;

const LEARNER_AUDIENCE_RULES = [
  `Write directly to the learner, in a warm, encouraging, age-appropriate tone.`,
  `Keep the entire response (headline plus message) under ${LEARNER_MAX_WORDS} words.`,
  "Never mention percentages, scores, or any numbers.",
  "Mention exactly one strength, one focus area, and what they will practise tomorrow.",
];

/** Builds the learner-audience prompt. Throws if given a context built for a different audience. */
export function buildLearnerPrompt(
  context: LearnerCoachingContext,
): PromptBuild {
  if (context.audience !== "learner") {
    throw new Error(
      `buildLearnerPrompt requires a "learner" audience context, got "${context.audience}"`,
    );
  }

  return {
    systemPrompt: buildSystemPrompt(LEARNER_AUDIENCE_RULES),
    userPrompt: buildUserPrompt(context),
    responseSchema: COACH_RESPONSE_JSON_SCHEMA,
  };
}

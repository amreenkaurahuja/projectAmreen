import type { LearnerCoachingContext } from "../coach/coach.types";
import { COACH_RESPONSE_JSON_SCHEMA } from "./coach-response-schema";
import {
  buildSystemPrompt,
  buildUserPrompt,
  type PromptBuild,
} from "./prompt-shared";

const PARENT_MAX_WORDS = 160;

const PARENT_AUDIENCE_RULES = [
  `Write to the parent about their child's recent learning, in a warm, informative tone.`,
  `Keep the entire response under ${PARENT_MAX_WORDS} words.`,
  "Mention recent progress, strengths, focus areas, the deterministic recommendations provided, and one simple home-support idea.",
];

/** Builds the parent-audience prompt. Throws if given a context built for a different audience. */
export function buildParentPrompt(
  context: LearnerCoachingContext,
): PromptBuild {
  if (context.audience !== "parent") {
    throw new Error(
      `buildParentPrompt requires a "parent" audience context, got "${context.audience}"`,
    );
  }

  return {
    systemPrompt: buildSystemPrompt(PARENT_AUDIENCE_RULES),
    userPrompt: buildUserPrompt(context),
    responseSchema: COACH_RESPONSE_JSON_SCHEMA,
  };
}

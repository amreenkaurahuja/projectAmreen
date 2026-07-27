import type {
  CoachResponse,
  LearnerCoachingContext,
} from "../coach/coach.types";
import { BANNED_PHRASES } from "./banned-phrases";

const PERCENT_PATTERN = /%|\bpercent\b/i;
/** "N hours every/each day/evening/night/week" — no excessive study-time advice, no matter how it's phrased. */
const EXCESSIVE_STUDY_PATTERN =
  /\b\d+\s*(?:hours?|hrs?)\s*(?:every|each)\s*(?:day|evening|night|morning|week)\b/i;
const NUMBER_PATTERN = /\b\d+(?:\.\d+)?\b/g;

const LEARNER_MAX_WORDS = 80;
const PARENT_MAX_WORDS = 160;

export interface GroundingViolation {
  reason: string;
}

function collectResponseText(response: CoachResponse): string {
  return [
    response.headline,
    response.message,
    ...response.strengths,
    ...response.focusAreas,
    ...response.nextSteps,
    response.disclaimer ?? "",
  ].join(" ");
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed.length === 0 ? 0 : trimmed.split(/\s+/).length;
}

function containsAny(haystack: string, needles: readonly string[]): boolean {
  return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}

/** Every item must reference at least one of the allowed names — skipped (nothing to check) when there's nothing to ground against. */
function findUngroundedItems(
  items: readonly string[],
  allowedNames: readonly string[],
): string[] {
  if (allowedNames.length === 0) return [];
  const lowerAllowed = allowedNames.map((name) => name.toLowerCase());
  return items.filter((item) => !containsAny(item.toLowerCase(), lowerAllowed));
}

/** The numbers a response is allowed to state — every other standalone number in the response is treated as invented. */
function collectAllowedNumbers(context: LearnerCoachingContext): Set<string> {
  const numbers = [
    context.currentStreak,
    context.totalQuestionsAnswered,
    context.skillsDueForReview,
    Math.round(context.overallMastery),
    Math.round(context.overallAccuracy),
  ];
  if (context.recentMission) {
    numbers.push(
      context.recentMission.score,
      context.recentMission.totalQuestions,
      context.recentMission.durationMinutes,
    );
  }
  return new Set(numbers.map((n) => String(n)));
}

/**
 * Content-safety and factual-grounding validation, run after shape
 * validation (response-validator.ts) passes. Compares the AI's response
 * against the DTO it was built from and rejects claims that don't trace
 * back to it:
 *
 * - every `strengths` item must name something in `strongestSkills`
 * - every `focusAreas` item must name something in `focusSkills` or the
 *   deterministic recommendations
 * - every `nextSteps` item must originate from the deterministic
 *   recommendations or `upcomingFocusSkills`
 * - every standalone number in the response must match a number that's
 *   actually present in the DTO (streak, questions answered, mastery,
 *   accuracy, recent mission score/questions/duration)
 * - banned diagnostic/comparative/predictive/ranking language, excessive
 *   study-time advice, and (for the learner audience) percentages
 * - the response fits the audience's word budget (80 words learner / 160
 *   words parent)
 *
 * A grounding check for an array is skipped when there's nothing in the
 * DTO to ground it against (e.g. no strongestSkills yet) — this validator
 * still cannot prove a wholly invented name is wrong when the DTO itself
 * has nothing relevant to compare it to; that residual gap is a known
 * limitation, not silently claimed to be covered.
 */
export function validateGrounding(
  response: CoachResponse,
  context: LearnerCoachingContext,
): GroundingViolation[] {
  const violations: GroundingViolation[] = [];
  const text = collectResponseText(response).toLowerCase();

  for (const phrase of BANNED_PHRASES) {
    if (text.includes(phrase)) {
      violations.push({ reason: `Contains banned phrase: "${phrase}"` });
    }
  }

  if (context.audience === "learner" && PERCENT_PATTERN.test(text)) {
    violations.push({
      reason: "Learner-facing message must not mention percentages",
    });
  }

  if (EXCESSIVE_STUDY_PATTERN.test(text)) {
    violations.push({ reason: "Contains excessive study-time advice" });
  }

  const strengthNames = context.strongestSkills.map((skill) => skill.name);
  for (const item of findUngroundedItems(response.strengths, strengthNames)) {
    violations.push({
      reason: `Strength "${item}" does not match any known strongest skill`,
    });
  }

  const focusNames = [
    ...context.focusSkills.map((skill) => skill.name),
    ...context.deterministicRecommendations.map((r) => r.title),
    ...context.deterministicRecommendations.map((r) => r.description),
  ];
  for (const item of findUngroundedItems(response.focusAreas, focusNames)) {
    violations.push({
      reason: `Focus area "${item}" does not match any known focus skill or recommendation`,
    });
  }

  const nextStepSources = [
    ...context.deterministicRecommendations.map((r) => r.title),
    ...context.deterministicRecommendations.map((r) => r.description),
    ...context.upcomingFocusSkills,
  ];
  for (const item of findUngroundedItems(response.nextSteps, nextStepSources)) {
    violations.push({
      reason: `Next step "${item}" does not originate from a recommendation or upcoming focus skill`,
    });
  }

  const allowedNumbers = collectAllowedNumbers(context);
  const mentionedNumbers =
    collectResponseText(response).match(NUMBER_PATTERN) ?? [];
  for (const numberText of mentionedNumbers) {
    if (!allowedNumbers.has(numberText)) {
      violations.push({
        reason: `Mentions a number ("${numberText}") not present in the learner's data`,
      });
    }
  }

  const wordLimit =
    context.audience === "learner" ? LEARNER_MAX_WORDS : PARENT_MAX_WORDS;
  const wordCount = countWords(`${response.headline} ${response.message}`);
  if (wordCount > wordLimit) {
    violations.push({
      reason: `Response is ${wordCount} words, over the ${wordLimit}-word limit for the ${context.audience} audience`,
    });
  }

  return violations;
}

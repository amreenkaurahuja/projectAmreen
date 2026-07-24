import { DEFAULT_TARGET_RESPONSE_MS } from "@/modules/learning-profile/mastery-calculator";
import type {
  EnrichedMasteryRecord,
  LearnerProfileSummary,
} from "@/modules/learning-profile/mastery.types";
import type { Recommendation } from "./dashboard.types";

// Pure, deterministic, rule-based — no AI/LLM calls. Rules are evaluated in
// a fixed priority order and the first 3 that apply are returned, so the
// same mastery data always produces the same recommendations. See
// docs/Architecture.md → "Parent Intelligence Dashboard" for the write-up.

const MAX_RECOMMENDATIONS = 3;
const VERY_WEAK_MASTERY_THRESHOLD = 40;
const HIGH_MASTERY_THRESHOLD = 80;
/** A skill's confidence trailing its mastery by at least this much is worth flagging. */
const CONFIDENCE_GAP_THRESHOLD = 10;
/** "High" response time — 1.5x the calculator's own target, reusing that constant rather than inventing a new one. */
const SLOW_RESPONSE_THRESHOLD_MS = DEFAULT_TARGET_RESPONSE_MS * 1.5;
const MAX_NAMED_SKILLS = 3;

function buildFocusWeakSkillRecommendation(
  records: EnrichedMasteryRecord[],
): Recommendation | null {
  const weakest = [...records]
    .filter((r) => r.masteryScore < VERY_WEAK_MASTERY_THRESHOLD)
    .sort((a, b) => a.masteryScore - b.masteryScore)[0];

  if (!weakest) return null;
  return {
    type: "focus_weak_skill",
    message: `Focus on ${weakest.skillName} tomorrow.`,
  };
}

function buildPracticeOverdueRecommendation(
  profile: LearnerProfileSummary,
): Recommendation | null {
  if (profile.skillsDueForReview.length === 0) return null;

  const names = profile.skillsDueForReview
    .slice(0, MAX_NAMED_SKILLS)
    .map((s) => s.skillName)
    .join(", ");

  return {
    type: "practice_overdue",
    message: `Practice overdue skills: ${names}.`,
  };
}

function buildSlowDownRecommendation(
  records: EnrichedMasteryRecord[],
): Recommendation | null {
  const lowestConfidence = [...records]
    .filter(
      (r) => r.masteryScore - r.confidenceScore >= CONFIDENCE_GAP_THRESHOLD,
    )
    .sort(
      (a, b) =>
        b.masteryScore -
        b.confidenceScore -
        (a.masteryScore - a.confidenceScore),
    )[0];

  if (!lowestConfidence) return null;
  return {
    type: "slow_down",
    message: `Confidence trails mastery on ${lowestConfidence.skillName} — encourage slowing down and thinking carefully.`,
  };
}

function buildTimedPracticeRecommendation(
  profile: LearnerProfileSummary,
): Recommendation | null {
  if (
    profile.averageResponseMs === null ||
    profile.averageResponseMs <= SLOW_RESPONSE_THRESHOLD_MS
  ) {
    return null;
  }
  return {
    type: "timed_practice",
    message: "Response times are running long — encourage some timed practice.",
  };
}

function buildAddChallengeRecommendation(
  records: EnrichedMasteryRecord[],
): Recommendation | null {
  if (records.length === 0) return null;
  if (!records.every((r) => r.masteryScore >= HIGH_MASTERY_THRESHOLD))
    return null;

  return {
    type: "add_challenge",
    message: "Every tracked skill is strong — add more challenge questions.",
  };
}

export function buildRecommendations(
  records: EnrichedMasteryRecord[],
  profile: LearnerProfileSummary,
): Recommendation[] {
  const candidates = [
    buildFocusWeakSkillRecommendation(records),
    buildPracticeOverdueRecommendation(profile),
    buildSlowDownRecommendation(records),
    buildTimedPracticeRecommendation(profile),
    buildAddChallengeRecommendation(records),
  ];

  return candidates
    .filter((r): r is Recommendation => r !== null)
    .slice(0, MAX_RECOMMENDATIONS);
}

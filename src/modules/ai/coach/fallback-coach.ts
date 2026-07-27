import type { CoachResponse, LearnerCoachingContext } from "./coach.types";

const DEFAULT_STRENGTH_MESSAGE = "You're building good learning habits";
const DEFAULT_FOCUS_MESSAGE = "Keep practising a little every day";
const DEFAULT_NEXT_STEP = "Keep up your daily practice";

/**
 * A deterministic, non-AI coaching response built directly from the DTO —
 * used whenever AI is disabled (AI_COACH_ENABLED=false), a provider call
 * fails or times out, or the response/grounding validators reject the AI's
 * output. Guarantees the platform still produces a coaching message with
 * zero AI involvement, matching the "if AI disappears tomorrow, the
 * platform still works" principle (docs/Architecture.md → "Planned: AI
 * Platform").
 */
export function buildFallbackCoachResponse(
  context: LearnerCoachingContext,
): CoachResponse {
  return context.audience === "learner"
    ? buildLearnerFallback(context)
    : buildParentFallback(context);
}

function buildLearnerFallback(context: LearnerCoachingContext): CoachResponse {
  const strength = context.strongestSkills[0]?.name;
  const focus = context.focusSkills[0]?.name;
  const tomorrow = context.upcomingFocusSkills[0];

  return {
    headline: "Great effort with your learning!",
    message: [
      strength
        ? `You're doing really well with ${strength}.`
        : "You're working hard on your missions.",
      focus
        ? `Let's keep practising ${focus}.`
        : "Keep practising a little each day.",
      tomorrow
        ? `Tomorrow we'll focus on ${tomorrow}.`
        : "Keep trying your best tomorrow too.",
    ].join(" "),
    strengths: [strength ?? DEFAULT_STRENGTH_MESSAGE],
    focusAreas: [focus ?? DEFAULT_FOCUS_MESSAGE],
    nextSteps: [
      tomorrow ? `Practise ${tomorrow} tomorrow.` : DEFAULT_NEXT_STEP,
    ],
    disclaimer: null,
  };
}

function buildParentFallback(context: LearnerCoachingContext): CoachResponse {
  const strengthNames = context.strongestSkills.map((skill) => skill.name);
  const focusNames = context.focusSkills.map((skill) => skill.name);

  return {
    headline: `Learning update for ${context.learnerDisplayName}`,
    message: [
      `${context.learnerDisplayName} has answered ${context.totalQuestionsAnswered} questions so far, with a current streak of ${context.currentStreak} day(s).`,
      strengthNames.length > 0
        ? `Strongest area: ${strengthNames[0]}.`
        : "Still building a track record across subjects.",
      focusNames.length > 0
        ? `Focus area: ${focusNames[0]}.`
        : "No specific focus area stands out yet.",
    ].join(" "),
    strengths:
      strengthNames.length > 0 ? strengthNames : [DEFAULT_STRENGTH_MESSAGE],
    focusAreas: focusNames.length > 0 ? focusNames : [DEFAULT_FOCUS_MESSAGE],
    nextSteps:
      context.deterministicRecommendations.length > 0
        ? context.deterministicRecommendations.map((r) => r.description)
        : [DEFAULT_NEXT_STEP],
    disclaimer: null,
  };
}

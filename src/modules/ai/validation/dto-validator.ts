import { z } from "zod";
import { AUDIENCES } from "../coach/audiences";
import type {
  LearnerCoachingContext,
  MissionSummary,
  Recommendation,
  SkillSummary,
  SubjectSummary,
} from "../coach/coach.types";

// Bounds mirror the limits already enforced by the deterministic engines
// this DTO is assembled from (see dashboard.service.ts's SKILL_HIGHLIGHT_LIMIT
// / UPCOMING_FOCUS_LIMIT and recommendation-engine.ts's MAX_RECOMMENDATIONS)
// — a context that violates them signals a genuine bug upstream, not a
// legitimately larger dataset.
export const MAX_SKILL_SUMMARIES = 5;
export const MAX_SUBJECT_SUMMARIES = 10;
export const MAX_RECOMMENDATIONS = 3;
export const MAX_UPCOMING_FOCUS_SKILLS = 3;

const percentScore = () => z.number().min(0).max(100);

// Typing each schema as z.ZodType<Shape> makes TypeScript check the schema's
// inferred output against the hand-written interface in coach.types.ts — if
// the two drift, this file fails to compile rather than silently diverging.
const skillSummarySchema: z.ZodType<SkillSummary> = z
  .object({
    name: z.string().min(1).max(120),
    subject: z.string().min(1).max(120),
    mastery: percentScore(),
    confidence: percentScore(),
  })
  .strict();

const subjectSummarySchema: z.ZodType<SubjectSummary> = z
  .object({
    subject: z.string().min(1).max(120),
    mastery: percentScore(),
    confidence: percentScore(),
    accuracy: percentScore(),
  })
  .strict();

const missionSummarySchema: z.ZodType<MissionSummary> = z
  .object({
    score: z.number().int().min(0),
    totalQuestions: z.number().int().min(0),
    durationMinutes: z.number().min(0),
    completedAt: z.string().min(1),
  })
  .strict();

const recommendationSchema: z.ZodType<Recommendation> = z
  .object({
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(300),
  })
  .strict();

export const LearnerCoachingContextSchema: z.ZodType<LearnerCoachingContext> = z
  .object({
    schemaVersion: z.literal("1.0"),
    promptVersion: z.literal("coach-v1"),
    audience: z.enum(AUDIENCES),
    learnerDisplayName: z.string().min(1).max(100),
    generatedForDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    overallMastery: percentScore(),
    overallAccuracy: percentScore(),
    totalQuestionsAnswered: z.number().int().min(0),
    currentStreak: z.number().int().min(0),
    skillsDueForReview: z.number().int().min(0),
    strongestSkills: z.array(skillSummarySchema).max(MAX_SKILL_SUMMARIES),
    focusSkills: z.array(skillSummarySchema).max(MAX_SKILL_SUMMARIES),
    subjectInsights: z.array(subjectSummarySchema).max(MAX_SUBJECT_SUMMARIES),
    deterministicRecommendations: z
      .array(recommendationSchema)
      .max(MAX_RECOMMENDATIONS),
    recentMission: missionSummarySchema.nullable(),
    upcomingFocusSkills: z
      .array(z.string().min(1).max(120))
      .max(MAX_UPCOMING_FOCUS_SKILLS),
  })
  .strict();

export type ValidationResult<T> =
  { success: true; data: T } | { success: false; error: string };

/** The one gate before Gemini: an invalid DTO is never sent, and the caller falls back instead. */
export function validateLearnerCoachingContext(
  candidate: unknown,
): ValidationResult<LearnerCoachingContext> {
  const result = LearnerCoachingContextSchema.safeParse(candidate);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data };
}

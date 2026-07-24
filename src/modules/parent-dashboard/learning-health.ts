import {
  buildSubjectSummaries,
  pickTopSkills,
} from "@/modules/learning-profile/mastery-summary";
import { computeMasteryDelta } from "@/modules/learning-profile/mastery-calculator";
import type {
  EnrichedMasteryRecord,
  LearnerProfileSummary,
} from "@/modules/learning-profile/mastery.types";
import type {
  MissionStatus,
  SelectionReason,
} from "@/modules/missions/mission.types";
import type {
  LearningHealth,
  MasteryLabel,
  SessionHistoryRow,
  SkillHighlight,
  SubjectInsight,
  WeeklyProgressRow,
} from "./dashboard.types";

// Pure, deterministic, no I/O — everything here operates on data already
// loaded by dashboard.service.ts (mastery records, mission/attempt rows).
// See docs/Architecture.md → "Parent Intelligence Dashboard" for the write-up.

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeMasteryLabel(masteryScore: number): MasteryLabel {
  if (masteryScore >= 80) return "Excellent";
  if (masteryScore >= 60) return "Developing";
  return "Needs Practice";
}

/** Reuses buildSubjectSummaries's aggregation, adds the qualitative label, sorts weakest first. */
export function buildSubjectInsights(
  records: EnrichedMasteryRecord[],
): SubjectInsight[] {
  return buildSubjectSummaries(records)
    .map((summary) => ({
      ...summary,
      masteryLabel: computeMasteryLabel(summary.masteryScore),
    }))
    .sort((a, b) => a.masteryScore - b.masteryScore);
}

/** Reuses pickTopSkills's ranking, adds whether the skill is currently due for review. */
export function buildSkillHighlights(
  records: EnrichedMasteryRecord[],
  direction: "strongest" | "weakest",
  limit: number,
  now: Date,
): SkillHighlight[] {
  const top = pickTopSkills(records, direction, limit);
  const bySkillId = new Map(records.map((r) => [r.skillId, r]));

  return top.map((skill) => {
    const record = bySkillId.get(skill.skillId);
    const reviewDue = Boolean(
      record?.nextReviewAt && new Date(record.nextReviewAt) <= now,
    );
    return { ...skill, reviewDue };
  });
}

/** Average response time * attempts, summed — an approximation of total time answering questions (see docs/Architecture.md for why there's no exact total stored). */
export function computeTotalStudyTimeMs(
  records: EnrichedMasteryRecord[],
): number {
  return records.reduce(
    (sum, r) => sum + (r.averageResponseMs ?? 0) * r.totalAttempts,
    0,
  );
}

export interface LearningStreak {
  currentStreakDays: number;
  longestStreakDays: number;
  daysLearnedThisMonth: number;
}

/**
 * All date arithmetic is UTC-only: `mission_date` is a Postgres `date` (no
 * time component), returned as a "YYYY-MM-DD" string, which `Date.parse`
 * interprets as UTC midnight — the same convention `mission.repository.ts`
 * already uses for `mission_date`. `referenceTimestamp` is read the same way
 * (UTC year/month/day), so there is exactly one timezone in play throughout.
 */
export function computeLearningStreak(
  completedMissionDates: string[],
  referenceTimestamp: Date,
): LearningStreak {
  const uniqueDates = [...new Set(completedMissionDates)].sort();

  if (uniqueDates.length === 0) {
    return {
      currentStreakDays: 0,
      longestStreakDays: 0,
      daysLearnedThisMonth: 0,
    };
  }

  const dayMs = uniqueDates.map((d) => Date.parse(d));

  let longestStreakDays = 1;
  let runLength = 1;
  for (let i = 1; i < dayMs.length; i += 1) {
    runLength = dayMs[i]! - dayMs[i - 1]! === MS_PER_DAY ? runLength + 1 : 1;
    longestStreakDays = Math.max(longestStreakDays, runLength);
  }

  let currentStreakDays = 1;
  for (let i = dayMs.length - 1; i > 0; i -= 1) {
    if (dayMs[i]! - dayMs[i - 1]! === MS_PER_DAY) {
      currentStreakDays += 1;
    } else {
      break;
    }
  }

  const lastDateMs = dayMs[dayMs.length - 1]!;
  const todayMs = Date.UTC(
    referenceTimestamp.getUTCFullYear(),
    referenceTimestamp.getUTCMonth(),
    referenceTimestamp.getUTCDate(),
  );
  const daysSinceLastCompletion = (todayMs - lastDateMs) / MS_PER_DAY;
  if (daysSinceLastCompletion > 1) {
    // More than a day has passed since the last completed mission with no
    // completion today — the streak is broken, not just "not extended yet."
    currentStreakDays = 0;
  }

  const refYear = referenceTimestamp.getUTCFullYear();
  const refMonth = referenceTimestamp.getUTCMonth();
  const daysLearnedThisMonth = uniqueDates.filter((d) => {
    const [year, month] = d.split("-").map(Number);
    return year === refYear && month! - 1 === refMonth;
  }).length;

  return { currentStreakDays, longestStreakDays, daysLearnedThisMonth };
}

export function buildLearningHealth(
  profile: LearnerProfileSummary,
  records: EnrichedMasteryRecord[],
  streak: LearningStreak,
): LearningHealth {
  return {
    overallMasteryScore: profile.overallMasteryScore,
    overallAccuracy: profile.overallAccuracy,
    totalQuestionsAnswered: profile.totalQuestionsAnswered,
    totalStudyTimeMs: computeTotalStudyTimeMs(records),
    currentStreakDays: streak.currentStreakDays,
    longestStreakDays: streak.longestStreakDays,
    daysLearnedThisMonth: streak.daysLearnedThisMonth,
    skillsDueForReviewCount: profile.skillsDueForReview.length,
  };
}

export interface MissionAttemptRow {
  isCorrect: boolean;
  difficulty: number | null | undefined;
  responseMs: number;
}

export interface MissionMeta {
  missionId: string;
  missionDate: string;
  status: MissionStatus;
  completedAt: string | null;
  questionCount: number;
}

function accuracyPercent(
  answeredCount: number,
  correctCount: number,
): number | null {
  return answeredCount > 0
    ? Math.round((correctCount / answeredCount) * 100)
    : null;
}

/** Most-recent-first, unfiltered by status — the full session history table. */
export function buildSessionHistory(
  missions: MissionMeta[],
  attemptsByMission: Map<string, MissionAttemptRow[]>,
): SessionHistoryRow[] {
  return missions.map((mission) => {
    const attempts = attemptsByMission.get(mission.missionId) ?? [];
    const correctCount = attempts.filter((a) => a.isCorrect).length;
    const totalResponseMs = attempts.reduce((sum, a) => sum + a.responseMs, 0);

    return {
      missionId: mission.missionId,
      missionDate: mission.missionDate,
      status: mission.status,
      completedAt: mission.completedAt,
      questionCount: mission.questionCount,
      answeredCount: attempts.length,
      accuracyPercent: accuracyPercent(attempts.length, correctCount),
      totalResponseMs,
    };
  });
}

/** Completed missions only, most recent first, capped at `limit` (default 7). */
export function buildWeeklyProgress(
  missions: MissionMeta[],
  attemptsByMission: Map<string, MissionAttemptRow[]>,
  limit = 7,
): WeeklyProgressRow[] {
  return missions
    .filter((mission) => mission.status === "completed")
    .slice(0, limit)
    .map((mission) => {
      const attempts = attemptsByMission.get(mission.missionId) ?? [];
      const correctCount = attempts.filter((a) => a.isCorrect).length;
      const totalResponseMs = attempts.reduce(
        (sum, a) => sum + a.responseMs,
        0,
      );
      const masteryChangeApprox = attempts.reduce(
        (sum, a) => sum + computeMasteryDelta(a.isCorrect, a.difficulty),
        0,
      );

      return {
        missionId: mission.missionId,
        missionDate: mission.missionDate,
        questionCount: mission.questionCount,
        accuracyPercent: accuracyPercent(attempts.length, correctCount),
        totalResponseMs,
        masteryChangeApprox,
      };
    });
}

interface FocusCandidate {
  skillId: string;
  reason: SelectionReason;
}

/**
 * Deterministically derives up to `limit` distinct skill IDs representing
 * "what tomorrow's mission will likely focus on," from the adaptive
 * selector's own output — no separate prediction logic, no exposed weights.
 * Prioritises weak_skill/review_due picks (in the selector's own — already
 * seeded, already deterministic — output order); if there aren't enough of
 * those, other selected skills fill the rest so a strong learner still gets
 * a preview instead of an empty one.
 */
export function extractUpcomingFocusSkillIds(
  items: FocusCandidate[],
  limit: number,
): string[] {
  const priorityReasons = new Set<SelectionReason>([
    "weak_skill",
    "review_due",
  ]);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    if (!priorityReasons.has(item.reason)) continue;
    if (seen.has(item.skillId)) continue;
    seen.add(item.skillId);
    result.push(item.skillId);
    if (result.length >= limit) return result;
  }

  for (const item of items) {
    if (seen.has(item.skillId)) continue;
    seen.add(item.skillId);
    result.push(item.skillId);
    if (result.length >= limit) break;
  }

  return result;
}

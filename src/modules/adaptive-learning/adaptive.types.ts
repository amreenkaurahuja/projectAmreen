import type { SelectionReason } from "@/modules/missions/mission.types";

export type { SelectionReason };

/** A candidate question, normalised from question_bank (+ its subject) for selection. */
export interface QuestionCandidate {
  questionId: string;
  subjectId: string;
  subjectSlug: string;
  topicId: string | null;
  skillId: string;
  /** 1-5. question_bank.difficulty defaults to 1 in the DB, so this is never null. */
  difficulty: number;
}

/** A learner's current mastery state for one skill, as stored in learner_skill_mastery. */
export interface SkillMasteryState {
  skillId: string;
  subjectId: string;
  masteryScore: number;
  totalAttempts: number;
  /** ISO 8601 UTC, or null if never scheduled. */
  nextReviewAt: string | null;
}

export interface SelectedQuestion {
  questionId: string;
  subjectId: string;
  subjectSlug: string;
  skillId: string;
  difficulty: number;
  reason: SelectionReason;
}

export interface AdaptiveCategoryTargets {
  weakSkill: number;
  reviewDue: number;
  curriculumCoverage: number;
  challenge: number;
}

export interface DifficultyBand {
  /** Inclusive lower bound of mastery this band applies to (0 for the lowest band). */
  minMastery: number;
  preferred: number[];
  allowed: number[];
}

export interface AdaptiveMissionConfig {
  missionSize: number;
  categoryTargets: AdaptiveCategoryTargets;
  /** learner_skill_mastery.mastery_score below this counts as a "weak" skill. */
  weakMasteryThreshold: number;
  /** Minimum mastery a skill needs to supply a "challenge" question, when alternatives exist. */
  challengeMinMastery: number;
  /** Challenge questions must be at least this difficulty. */
  challengeMinDifficulty: number;
  /** Never pull a challenge question from a skill below this mastery unless there is no alternative. */
  challengeExcludeBelowMastery: number;
  /** Soft cap on questions from one subject in a single mission. */
  subjectSoftCap: number;
  /** Aim for at least this many questions from every active subject when possible. */
  subjectSoftMinimum: number;
  /** A question answered within this many days of the reference timestamp is on cooldown. */
  cooldownDays: number;
  /** New-learner baseline: max number of difficulty-4 questions to include. */
  newLearnerMaxDifficulty4: number;
  /** New-learner baseline: difficulty-5 questions are excluded unless the pool is otherwise insufficient. */
  newLearnerAllowDifficulty5: boolean;
  /** Mastery -> preferred/allowed difficulty bands, evaluated in order (first match by minMastery wins, highest applicable). */
  difficultyBands: DifficultyBand[];
  /** Preferred difficulty range for a skill with no mastery row (untested). */
  untestedSkillDifficulty: number[];
}

export interface AdaptiveSelectionInput {
  learnerId: string;
  missionDate: string;
  referenceTimestamp: Date;
  candidates: QuestionCandidate[];
  masteryBySkill: Map<string, SkillMasteryState>;
  /** questionId -> most recent answered_at (ISO string) across all of the learner's history. */
  recentAttemptsByQuestion: Map<string, string>;
  /** Active subject slugs, for baseline distribution and coverage bookkeeping. */
  activeSubjectSlugs: string[];
  config: AdaptiveMissionConfig;
}

export interface AdaptiveSelectionResult {
  items: SelectedQuestion[];
  categoryCounts: Record<SelectionReason, number>;
  fallbackCount: number;
  candidateCount: number;
  /** True when fewer than config.missionSize eligible candidates existed at all. */
  capacityWarning: boolean;
}

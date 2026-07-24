export interface MasteryState {
  masteryScore: number;
  confidenceScore: number;
  totalAttempts: number;
  correctAttempts: number;
  incorrectAttempts: number;
  averageResponseMs: number | null;
  lastResponseMs: number | null;
  /** Consecutive correct answers. Resets to 0 on any incorrect answer. */
  currentStreak: number;
  /** Best-ever value of currentStreak. */
  bestStreak: number;
  /** Consecutive incorrect answers. Resets to 0 on any correct answer. */
  currentIncorrectStreak: number;
  lastAttemptCorrect: boolean | null;
  /** ISO 8601 UTC timestamp, or null if never attempted. */
  lastPractisedAt: string | null;
  /** ISO 8601 UTC timestamp, or null if never attempted. */
  nextReviewAt: string | null;
}

export interface AttemptEvent {
  isCorrect: boolean;
  /** question_bank.difficulty (1–5). Missing/invalid values default to 3. */
  difficulty: number | null | undefined;
  /** question_bank/question_attempts response time in ms. Null is handled explicitly. */
  responseMs: number | null | undefined;
  /** Reference "now" for review scheduling — always passed explicitly, never read from the system clock inside the calculator, so scheduling stays deterministic and testable. */
  answeredAt: Date;
}

export interface LearnerSkillMasteryRecord extends MasteryState {
  id: string;
  learnerId: string;
  skillId: string;
  subjectId: string;
  topicId: string | null;
  updatedAt: string;
}

export interface SkillCurriculumMetadata {
  skillId: string;
  subjectId: string;
  topicId: string | null;
  difficulty: number;
}

export type MasteryProcessingOutcome =
  | { processed: true; mastery: LearnerSkillMasteryRecord }
  | {
      processed: false;
      reason: "already-processed" | "no-resolvable-skill" | "error";
    };

/** A mastery row joined with the human-readable names needed for the profile summary/UI. */
export interface EnrichedMasteryRecord extends LearnerSkillMasteryRecord {
  skillName: string;
  subjectName: string;
}

export interface SkillSummary {
  skillId: string;
  skillName: string;
  subjectId: string;
  subjectName: string;
  masteryScore: number;
  confidenceScore: number;
}

export interface SubjectSummary {
  subjectId: string;
  subjectName: string;
  /** Weighted average across the subject's skills, weighted by totalAttempts. */
  masteryScore: number;
  confidenceScore: number;
  totalAttempts: number;
  /** 0-100, correctAttempts / totalAttempts across the subject's skills. */
  accuracy: number;
  /** Weighted average across skills with a recorded response time; null if none do. */
  averageResponseMs: number | null;
}

export interface SkillDueForReview {
  skillId: string;
  skillName: string;
  subjectId: string;
  subjectName: string;
  nextReviewAt: string;
}

export interface LearnerProfileSummary {
  /** False when the learner has no mastery data yet — every other field is a neutral default. */
  hasData: boolean;
  overallMasteryScore: number | null;
  overallConfidenceScore: number | null;
  totalQuestionsAnswered: number;
  correctAnswers: number;
  /** 0-100, or null when totalQuestionsAnswered is 0. */
  overallAccuracy: number | null;
  averageResponseMs: number | null;
  strongestSubject: SubjectSummary | null;
  weakestSubject: SubjectSummary | null;
  subjectSummaries: SubjectSummary[];
  /** Highest-mastery skills, max 3, ties broken by skill name for determinism. */
  strongestSkills: SkillSummary[];
  /** Lowest-mastery skills, max 3, ties broken by skill name for determinism. */
  weakestSkills: SkillSummary[];
  /** Skills whose nextReviewAt has passed the reference "now", earliest first. */
  skillsDueForReview: SkillDueForReview[];
  /** ISO 8601 UTC timestamp of the most recent attempt across all skills, or null. */
  lastPractisedAt: string | null;
}

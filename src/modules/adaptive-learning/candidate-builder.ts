import type { QuestionCandidate, SkillMasteryState } from "./adaptive.types";

// Pure, no I/O — converts raw Supabase rows into the normalised shapes the
// selector works with. Also where the "hygiene" candidate exclusions live
// (inactive is filtered at the query level already; a missing skill_id is
// excluded here defensively even though question_bank.skill_id has been
// NOT NULL since migration 0008 — see docs/Database.md).

export interface RawQuestionCandidateRow {
  id: string;
  subject_id: string;
  topic_id: string | null;
  skill_id: string | null;
  difficulty: number | null;
  subjects: { slug: string } | { slug: string }[] | null;
}

export interface RawMasteryRow {
  skill_id: string;
  subject_id: string;
  mastery_score: number;
  total_attempts: number;
  next_review_at: string | null;
}

export interface RawRecentAttemptRow {
  question_id: string;
  answered_at: string;
}

function resolveSubjectSlug(
  subjects: RawQuestionCandidateRow["subjects"],
): string | null {
  if (!subjects) return null;
  const row = Array.isArray(subjects) ? subjects[0] : subjects;
  return row?.slug ?? null;
}

export function buildQuestionCandidates(
  rows: RawQuestionCandidateRow[],
): QuestionCandidate[] {
  const candidates: QuestionCandidate[] = [];

  for (const row of rows) {
    if (!row.skill_id) continue;
    const subjectSlug = resolveSubjectSlug(row.subjects);
    if (!subjectSlug) continue;

    candidates.push({
      questionId: row.id,
      subjectId: row.subject_id,
      subjectSlug,
      topicId: row.topic_id,
      skillId: row.skill_id,
      difficulty: row.difficulty ?? 1,
    });
  }

  return candidates;
}

export function buildMasteryLookup(
  rows: RawMasteryRow[],
): Map<string, SkillMasteryState> {
  const lookup = new Map<string, SkillMasteryState>();

  for (const row of rows) {
    lookup.set(row.skill_id, {
      skillId: row.skill_id,
      subjectId: row.subject_id,
      masteryScore: row.mastery_score,
      totalAttempts: row.total_attempts,
      nextReviewAt: row.next_review_at,
    });
  }

  return lookup;
}

/** Keeps the most recent answered_at per question — a question can recur across missions over time. */
export function buildRecentAttemptLookup(
  rows: RawRecentAttemptRow[],
): Map<string, string> {
  const lookup = new Map<string, string>();

  for (const row of rows) {
    const existing = lookup.get(row.question_id);
    if (!existing || new Date(row.answered_at) > new Date(existing)) {
      lookup.set(row.question_id, row.answered_at);
    }
  }

  return lookup;
}

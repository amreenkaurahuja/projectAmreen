import type {
  EnrichedMasteryRecord,
  LearnerProfileSummary,
  SkillDueForReview,
  SkillSummary,
  SubjectSummary,
} from "./mastery.types";

// Pure, deterministic, no I/O — aggregates a learner's already-loaded mastery
// rows into the dashboard-facing summary shape. See docs/Architecture.md →
// "Learning profile & mastery" for the write-up.

const MAX_HIGHLIGHT_SKILLS = 3;

function emptySummary(): LearnerProfileSummary {
  return {
    hasData: false,
    overallMasteryScore: null,
    overallConfidenceScore: null,
    totalQuestionsAnswered: 0,
    correctAnswers: 0,
    overallAccuracy: null,
    averageResponseMs: null,
    strongestSubject: null,
    weakestSubject: null,
    subjectSummaries: [],
    strongestSkills: [],
    weakestSkills: [],
    skillsDueForReview: [],
    lastPractisedAt: null,
  };
}

function weightedAverage(
  entries: Array<{ value: number; weight: number }>,
): number | null {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return null;
  const weightedSum = entries.reduce(
    (sum, entry) => sum + entry.value * entry.weight,
    0,
  );
  return Math.round(weightedSum / totalWeight);
}

function toSkillSummary(record: EnrichedMasteryRecord): SkillSummary {
  return {
    skillId: record.skillId,
    skillName: record.skillName,
    subjectId: record.subjectId,
    subjectName: record.subjectName,
    masteryScore: record.masteryScore,
    confidenceScore: record.confidenceScore,
  };
}

function buildSubjectSummaries(
  records: EnrichedMasteryRecord[],
): SubjectSummary[] {
  const bySubject = new Map<string, EnrichedMasteryRecord[]>();
  for (const record of records) {
    const group = bySubject.get(record.subjectId) ?? [];
    group.push(record);
    bySubject.set(record.subjectId, group);
  }

  const summaries = Array.from(bySubject.values()).map((group) => {
    const totalAttempts = group.reduce((sum, r) => sum + r.totalAttempts, 0);
    const correctAttempts = group.reduce(
      (sum, r) => sum + r.correctAttempts,
      0,
    );

    return {
      subjectId: group[0]!.subjectId,
      subjectName: group[0]!.subjectName,
      masteryScore:
        weightedAverage(
          group.map((r) => ({
            value: r.masteryScore,
            weight: r.totalAttempts,
          })),
        ) ?? 0,
      confidenceScore:
        weightedAverage(
          group.map((r) => ({
            value: r.confidenceScore,
            weight: r.totalAttempts,
          })),
        ) ?? 0,
      totalAttempts,
      accuracy:
        totalAttempts > 0
          ? Math.round((correctAttempts / totalAttempts) * 100)
          : 0,
    };
  });

  return summaries.sort((a, b) => a.subjectName.localeCompare(b.subjectName));
}

/**
 * Ranks by masteryScore (desc for strongest, asc for weakest), breaking ties
 * by skillName so the result is deterministic regardless of input/DB order.
 */
function pickTopSkills(
  records: EnrichedMasteryRecord[],
  direction: "strongest" | "weakest",
): SkillSummary[] {
  const sorted = [...records].sort((a, b) => {
    const delta =
      direction === "strongest"
        ? b.masteryScore - a.masteryScore
        : a.masteryScore - b.masteryScore;
    return delta !== 0 ? delta : a.skillName.localeCompare(b.skillName);
  });
  return sorted.slice(0, MAX_HIGHLIGHT_SKILLS).map(toSkillSummary);
}

function pickEdgeSubject(
  subjectSummaries: SubjectSummary[],
  direction: "strongest" | "weakest",
): SubjectSummary | null {
  if (subjectSummaries.length === 0) return null;
  return [...subjectSummaries].sort((a, b) => {
    const delta =
      direction === "strongest"
        ? b.masteryScore - a.masteryScore
        : a.masteryScore - b.masteryScore;
    return delta !== 0 ? delta : a.subjectName.localeCompare(b.subjectName);
  })[0]!;
}

function buildSkillsDueForReview(
  records: EnrichedMasteryRecord[],
  now: Date,
): SkillDueForReview[] {
  const nowMs = now.getTime();
  return records
    .filter(
      (r) =>
        r.nextReviewAt !== null && new Date(r.nextReviewAt).getTime() <= nowMs,
    )
    .sort(
      (a, b) =>
        new Date(a.nextReviewAt!).getTime() -
        new Date(b.nextReviewAt!).getTime(),
    )
    .map((r) => ({
      skillId: r.skillId,
      skillName: r.skillName,
      subjectId: r.subjectId,
      subjectName: r.subjectName,
      nextReviewAt: r.nextReviewAt!,
    }));
}

export function buildLearnerProfileSummary(
  records: EnrichedMasteryRecord[],
  now: Date,
): LearnerProfileSummary {
  if (records.length === 0) {
    return emptySummary();
  }

  const totalQuestionsAnswered = records.reduce(
    (sum, r) => sum + r.totalAttempts,
    0,
  );
  const correctAnswers = records.reduce((sum, r) => sum + r.correctAttempts, 0);

  const responseTimeEntries = records
    .filter(
      (r): r is EnrichedMasteryRecord & { averageResponseMs: number } =>
        r.averageResponseMs !== null,
    )
    .map((r) => ({ value: r.averageResponseMs, weight: r.totalAttempts }));

  const subjectSummaries = buildSubjectSummaries(records);

  const lastPractisedAt =
    records
      .map((r) => r.lastPractisedAt)
      .filter((value): value is string => value !== null)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  return {
    hasData: true,
    overallMasteryScore: weightedAverage(
      records.map((r) => ({ value: r.masteryScore, weight: r.totalAttempts })),
    ),
    overallConfidenceScore: weightedAverage(
      records.map((r) => ({
        value: r.confidenceScore,
        weight: r.totalAttempts,
      })),
    ),
    totalQuestionsAnswered,
    correctAnswers,
    overallAccuracy:
      totalQuestionsAnswered > 0
        ? Math.round((correctAnswers / totalQuestionsAnswered) * 100)
        : null,
    averageResponseMs: weightedAverage(responseTimeEntries),
    strongestSubject: pickEdgeSubject(subjectSummaries, "strongest"),
    weakestSubject: pickEdgeSubject(subjectSummaries, "weakest"),
    subjectSummaries,
    strongestSkills: pickTopSkills(records, "strongest"),
    weakestSkills: pickTopSkills(records, "weakest"),
    skillsDueForReview: buildSkillsDueForReview(records, now),
    lastPractisedAt,
  };
}

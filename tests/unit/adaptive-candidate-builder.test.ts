import { describe, expect, it } from "vitest";
import {
  buildMasteryLookup,
  buildQuestionCandidates,
  buildRecentAttemptLookup,
} from "@/modules/adaptive-learning/candidate-builder";

describe("buildQuestionCandidates", () => {
  it("normalises a raw question_bank row into a candidate", () => {
    const candidates = buildQuestionCandidates([
      {
        id: "q1",
        subject_id: "subject-1",
        topic_id: "topic-1",
        skill_id: "skill-1",
        difficulty: 3,
        subjects: { slug: "mathematics" },
      },
    ]);

    expect(candidates).toEqual([
      {
        questionId: "q1",
        subjectId: "subject-1",
        subjectSlug: "mathematics",
        topicId: "topic-1",
        skillId: "skill-1",
        difficulty: 3,
      },
    ]);
  });

  it("excludes a row with no skill_id", () => {
    const candidates = buildQuestionCandidates([
      {
        id: "q1",
        subject_id: "subject-1",
        topic_id: "topic-1",
        skill_id: null,
        difficulty: 3,
        subjects: { slug: "mathematics" },
      },
    ]);

    expect(candidates).toEqual([]);
  });

  it("excludes a row with no resolvable subject slug", () => {
    const candidates = buildQuestionCandidates([
      {
        id: "q1",
        subject_id: "subject-1",
        topic_id: "topic-1",
        skill_id: "skill-1",
        difficulty: 3,
        subjects: null,
      },
    ]);

    expect(candidates).toEqual([]);
  });

  it("handles subjects returned as an embed array (PostgREST shape)", () => {
    const candidates = buildQuestionCandidates([
      {
        id: "q1",
        subject_id: "subject-1",
        topic_id: "topic-1",
        skill_id: "skill-1",
        difficulty: 2,
        subjects: [{ slug: "english" }],
      },
    ]);

    expect(candidates[0]?.subjectSlug).toBe("english");
  });

  it("defaults a null difficulty to 1", () => {
    const candidates = buildQuestionCandidates([
      {
        id: "q1",
        subject_id: "subject-1",
        topic_id: "topic-1",
        skill_id: "skill-1",
        difficulty: null,
        subjects: { slug: "mathematics" },
      },
    ]);

    expect(candidates[0]?.difficulty).toBe(1);
  });
});

describe("buildMasteryLookup", () => {
  it("keys mastery state by skill id", () => {
    const lookup = buildMasteryLookup([
      {
        skill_id: "skill-1",
        subject_id: "subject-1",
        mastery_score: 45,
        total_attempts: 6,
        next_review_at: "2026-07-20T00:00:00.000Z",
      },
    ]);

    expect(lookup.get("skill-1")).toEqual({
      skillId: "skill-1",
      subjectId: "subject-1",
      masteryScore: 45,
      totalAttempts: 6,
      nextReviewAt: "2026-07-20T00:00:00.000Z",
    });
  });
});

describe("buildRecentAttemptLookup", () => {
  it("keeps the most recent answered_at per question", () => {
    const lookup = buildRecentAttemptLookup([
      { question_id: "q1", answered_at: "2026-07-10T00:00:00.000Z" },
      { question_id: "q1", answered_at: "2026-07-18T00:00:00.000Z" },
      { question_id: "q2", answered_at: "2026-07-15T00:00:00.000Z" },
    ]);

    expect(lookup.get("q1")).toBe("2026-07-18T00:00:00.000Z");
    expect(lookup.get("q2")).toBe("2026-07-15T00:00:00.000Z");
  });
});

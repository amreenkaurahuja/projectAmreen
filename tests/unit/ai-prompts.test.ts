import { describe, expect, it } from "vitest";
import { buildLearnerPrompt } from "@/modules/ai/prompts/learner-prompt";
import { buildParentPrompt } from "@/modules/ai/prompts/parent-prompt";
import type { LearnerCoachingContext } from "@/modules/ai/coach/coach.types";

function context(
  audience: "learner" | "parent",
  overrides: Partial<LearnerCoachingContext> = {},
): LearnerCoachingContext {
  return {
    schemaVersion: "1.0",
    promptVersion: "coach-v1",
    audience,
    learnerDisplayName: "Amelia",
    generatedForDate: "2026-07-21",
    overallMastery: 60,
    overallAccuracy: 65,
    totalQuestionsAnswered: 10,
    currentStreak: 2,
    skillsDueForReview: 0,
    strongestSkills: [],
    focusSkills: [],
    subjectInsights: [],
    deterministicRecommendations: [],
    recentMission: null,
    upcomingFocusSkills: [],
    ...overrides,
  };
}

describe("buildLearnerPrompt", () => {
  it("builds a system prompt with learner-specific rules and a JSON schema", () => {
    const build = buildLearnerPrompt(context("learner"));

    expect(build.systemPrompt).toContain("80 words");
    expect(build.systemPrompt).toContain("Never mention percentages");
    expect(build.systemPrompt).toContain("ONLY source of truth");
    expect(build.responseSchema.type).toBe("OBJECT");
    expect(build.userPrompt).toContain("Amelia");
  });

  it("throws if given a parent-audience context", () => {
    expect(() => buildLearnerPrompt(context("parent"))).toThrow();
  });

  it("embeds the DTO as the user prompt, not free text", () => {
    const ctx = context("learner", { learnerDisplayName: "Zara" });
    const build = buildLearnerPrompt(ctx);
    const parsedDto = JSON.parse(
      build.userPrompt.split("\n").slice(1).join("\n"),
    );
    expect(parsedDto.learnerDisplayName).toBe("Zara");
  });
});

describe("buildParentPrompt", () => {
  it("builds a system prompt with parent-specific rules", () => {
    const build = buildParentPrompt(context("parent"));

    expect(build.systemPrompt).toContain("160 words");
    expect(build.systemPrompt).toContain("home-support");
    expect(build.responseSchema.type).toBe("OBJECT");
  });

  it("throws if given a learner-audience context", () => {
    expect(() => buildParentPrompt(context("learner"))).toThrow();
  });
});

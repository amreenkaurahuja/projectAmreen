import { describe, expect, it } from "vitest";
import {
  MissionGenerationError,
  generateMissionItems,
} from "@/modules/missions/mission.generator";

describe("mission generator", () => {
  it("builds the expected 8/4/2/2 subject mix", () => {
    const items = generateMissionItems({
      mathematics: Array.from({ length: 8 }, (_, index) => ({
        id: `math-${index}`,
        subjectSlug: "mathematics",
      })),
      english: Array.from({ length: 4 }, (_, index) => ({
        id: `eng-${index}`,
        subjectSlug: "english",
      })),
      "verbal-reasoning": Array.from({ length: 2 }, (_, index) => ({
        id: `vr-${index}`,
        subjectSlug: "verbal-reasoning",
      })),
      "non-verbal-reasoning": Array.from({ length: 2 }, (_, index) => ({
        id: `nvr-${index}`,
        subjectSlug: "non-verbal-reasoning",
      })),
    });

    expect(items).toHaveLength(16);
    expect(items.map((item) => item.position)).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 1),
    );

    const counts = items.reduce<Record<string, number>>((accumulator, item) => {
      const current = accumulator[item.subjectSlug] ?? 0;
      accumulator[item.subjectSlug] = current + 1;
      return accumulator;
    }, {});

    expect(counts.mathematics).toBe(8);
    expect(counts.english).toBe(4);
    expect(counts["verbal-reasoning"]).toBe(2);
    expect(counts["non-verbal-reasoning"]).toBe(2);
  });

  it("returns exactly 16 unique questions", () => {
    const items = generateMissionItems({
      mathematics: Array.from({ length: 8 }, (_, index) => ({
        id: `math-${index}`,
        subjectSlug: "mathematics",
      })),
      english: Array.from({ length: 4 }, (_, index) => ({
        id: `eng-${index}`,
        subjectSlug: "english",
      })),
      "verbal-reasoning": Array.from({ length: 2 }, (_, index) => ({
        id: `vr-${index}`,
        subjectSlug: "verbal-reasoning",
      })),
      "non-verbal-reasoning": Array.from({ length: 2 }, (_, index) => ({
        id: `nvr-${index}`,
        subjectSlug: "non-verbal-reasoning",
      })),
    });

    const questionIds = items.map((item) => item.questionId);
    expect(new Set(questionIds).size).toBe(16);
  });

  it("fails clearly when a subject does not have enough questions", () => {
    expect(() =>
      generateMissionItems({
        mathematics: Array.from({ length: 8 }, (_, index) => ({
          id: `math-${index}`,
          subjectSlug: "mathematics",
        })),
        english: Array.from({ length: 3 }, (_, index) => ({
          id: `eng-${index}`,
          subjectSlug: "english",
        })),
        "verbal-reasoning": Array.from({ length: 2 }, (_, index) => ({
          id: `vr-${index}`,
          subjectSlug: "verbal-reasoning",
        })),
        "non-verbal-reasoning": Array.from({ length: 2 }, (_, index) => ({
          id: `nvr-${index}`,
          subjectSlug: "non-verbal-reasoning",
        })),
      }),
    ).toThrowError(MissionGenerationError);
  });
});

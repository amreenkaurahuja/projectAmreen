import { describe, expect, it } from "vitest";
import type { CurriculumSubject } from "@/lib/curriculum/types";

describe("curriculum catalogue shape", () => {
  it("supports a subject with ordered topics and skills", () => {
    const subject: CurriculumSubject = {
      id: "subject-1",
      slug: "mathematics",
      name: "Mathematics",
      description: "Number and reasoning",
      icon: "➗",
      sort_order: 10,
      topics: [
        {
          id: "topic-1",
          slug: "arithmetic",
          name: "Arithmetic",
          description: "Four operations",
          sort_order: 10,
          skills: [
            {
              id: "skill-1",
              code: "MATH-ARI-01",
              name: "Four-operation fluency",
              description: "Calculate accurately",
              difficulty: 2,
            },
          ],
        },
      ],
    };

    expect(subject.slug).toBe("mathematics");
    expect(subject.topics?.[0].skills[0].difficulty).toBe(2);
  });
});

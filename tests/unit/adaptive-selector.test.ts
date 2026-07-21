import { describe, expect, it } from "vitest";
import { selectAdaptiveMission } from "@/modules/adaptive-learning/adaptive-selector";
import { DEFAULT_ADAPTIVE_CONFIG } from "@/modules/adaptive-learning/adaptive-config";
import type {
  AdaptiveSelectionInput,
  QuestionCandidate,
  SkillMasteryState,
} from "@/modules/adaptive-learning/adaptive.types";

const REF = new Date("2026-07-21T00:00:00.000Z");
const SUBJECTS = [
  "mathematics",
  "english",
  "verbal-reasoning",
  "non-verbal-reasoning",
];

function candidate(
  questionId: string,
  overrides: Partial<QuestionCandidate> = {},
): QuestionCandidate {
  return {
    questionId,
    subjectId: `subject-${overrides.subjectSlug ?? "mathematics"}`,
    subjectSlug: "mathematics",
    topicId: "topic-1",
    skillId: "skill-1",
    difficulty: 3,
    ...overrides,
  };
}

function mastery(
  overrides: Partial<SkillMasteryState> = {},
): SkillMasteryState {
  return {
    skillId: "skill-1",
    subjectId: "subject-mathematics",
    masteryScore: 50,
    totalAttempts: 3,
    nextReviewAt: null,
    ...overrides,
  };
}

/** A large, varied pool: `skillCount` skills per subject, several questions and difficulties per skill. */
function buildLargePool(): {
  candidates: QuestionCandidate[];
  masteryBySkill: Map<string, SkillMasteryState>;
} {
  const candidates: QuestionCandidate[] = [];
  const masteryBySkill = new Map<string, SkillMasteryState>();

  for (const subject of SUBJECTS) {
    for (let skillIndex = 0; skillIndex < 5; skillIndex += 1) {
      const skillId = `${subject}-skill-${skillIndex}`;
      const masteryScore = [20, 45, 55, 75, 90][skillIndex]!;
      masteryBySkill.set(skillId, {
        skillId,
        subjectId: `subject-${subject}`,
        masteryScore,
        totalAttempts: 4 + skillIndex,
        nextReviewAt:
          skillIndex === 0
            ? new Date(REF.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString()
            : null,
      });

      for (let difficulty = 1; difficulty <= 5; difficulty += 1) {
        candidates.push(
          candidate(`${skillId}-d${difficulty}-q1`, {
            subjectSlug: subject,
            subjectId: `subject-${subject}`,
            skillId,
            difficulty,
          }),
        );
        candidates.push(
          candidate(`${skillId}-d${difficulty}-q2`, {
            subjectSlug: subject,
            subjectId: `subject-${subject}`,
            skillId,
            difficulty,
          }),
        );
      }
    }
  }

  return { candidates, masteryBySkill };
}

function buildInput(
  overrides: Partial<AdaptiveSelectionInput> = {},
): AdaptiveSelectionInput {
  const { candidates, masteryBySkill } = buildLargePool();
  return {
    learnerId: "learner-1",
    missionDate: "2026-07-21",
    referenceTimestamp: REF,
    candidates,
    masteryBySkill,
    recentAttemptsByQuestion: new Map(),
    activeSubjectSlugs: SUBJECTS,
    config: DEFAULT_ADAPTIVE_CONFIG,
    ...overrides,
  };
}

describe("selectAdaptiveMission — determinism", () => {
  it("produces an identical mission for the same learner/date/data", () => {
    const input = buildInput();
    const first = selectAdaptiveMission(input);
    const second = selectAdaptiveMission(buildInput());

    expect(second.items.map((i) => i.questionId)).toEqual(
      first.items.map((i) => i.questionId),
    );
  });

  it("changes ordering/selection for a different mission date", () => {
    const a = selectAdaptiveMission(buildInput({ missionDate: "2026-07-21" }));
    const b = selectAdaptiveMission(buildInput({ missionDate: "2026-07-22" }));

    expect(b.items.map((i) => i.questionId)).not.toEqual(
      a.items.map((i) => i.questionId),
    );
  });

  it("changes ordering for a different learner", () => {
    const a = selectAdaptiveMission(buildInput({ learnerId: "learner-a" }));
    const b = selectAdaptiveMission(buildInput({ learnerId: "learner-b" }));

    expect(b.items.map((i) => i.questionId)).not.toEqual(
      a.items.map((i) => i.questionId),
    );
  });
});

describe("selectAdaptiveMission — basic shape", () => {
  it("selects exactly 16 unique questions when enough candidates exist", () => {
    const result = selectAdaptiveMission(buildInput());

    expect(result.items).toHaveLength(16);
    expect(new Set(result.items.map((i) => i.questionId)).size).toBe(16);
    expect(result.capacityWarning).toBe(false);
  });

  it("never produces duplicate question IDs", () => {
    const result = selectAdaptiveMission(buildInput());
    const ids = result.items.map((i) => i.questionId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("assigns a stable selection reason to every item", () => {
    const result = selectAdaptiveMission(buildInput());
    const validReasons = new Set([
      "weak_skill",
      "review_due",
      "curriculum_coverage",
      "challenge",
      "fallback",
    ]);
    for (const item of result.items) {
      expect(validReasons.has(item.reason)).toBe(true);
    }
  });
});

describe("selectAdaptiveMission — category allocation", () => {
  it("allocates weak-skill questions from skills below the mastery threshold", () => {
    const result = selectAdaptiveMission(buildInput());
    const weakItems = result.items.filter((i) => i.reason === "weak_skill");

    expect(weakItems.length).toBeGreaterThan(0);
    for (const item of weakItems) {
      const state = buildLargePool().masteryBySkill.get(item.skillId);
      expect(state!.masteryScore).toBeLessThan(60);
    }
  });

  it("allocates review-due questions from skills whose next_review_at has passed", () => {
    const result = selectAdaptiveMission(buildInput());
    const dueItems = result.items.filter((i) => i.reason === "review_due");

    expect(dueItems.length).toBeGreaterThan(0);
    for (const item of dueItems) {
      expect(item.skillId).toContain("skill-0");
    }
  });

  it("allocates curriculum-coverage questions distributed across subjects", () => {
    const result = selectAdaptiveMission(buildInput());
    const coverageItems = result.items.filter(
      (i) => i.reason === "curriculum_coverage",
    );

    expect(coverageItems.length).toBeGreaterThan(0);
    const subjectsSeen = new Set(coverageItems.map((i) => i.subjectSlug));
    // With 3 coverage slots and 4 subjects available, at least 2 different
    // subjects should appear rather than everything from one subject.
    expect(subjectsSeen.size).toBeGreaterThan(1);
  });

  it("allocates challenge questions at difficulty 4 or 5 from higher-mastery skills", () => {
    const result = selectAdaptiveMission(buildInput());
    const challengeItems = result.items.filter((i) => i.reason === "challenge");

    expect(challengeItems.length).toBeGreaterThan(0);
    for (const item of challengeItems) {
      expect(item.difficulty).toBeGreaterThanOrEqual(4);
    }
  });

  it("does not pick challenge questions from a weak (<50 mastery) skill when alternatives exist", () => {
    const result = selectAdaptiveMission(buildInput());
    const challengeItems = result.items.filter((i) => i.reason === "challenge");
    const pool = buildLargePool();

    for (const item of challengeItems) {
      const state = pool.masteryBySkill.get(item.skillId);
      if (state) {
        expect(state.masteryScore).toBeGreaterThanOrEqual(50);
      }
    }
  });
});

describe("selectAdaptiveMission — category shortfall fallback", () => {
  it("fills remaining slots via fallback when a category has too few eligible questions", () => {
    // Only two skills total, one weak (plenty of weak candidates) and one
    // strong; no review-due, thin coverage/challenge pools -> heavy fallback.
    const candidates: QuestionCandidate[] = [];
    for (let i = 0; i < 20; i += 1) {
      candidates.push(
        candidate(`weak-q${i}`, { skillId: "weak-skill", difficulty: 2 }),
      );
    }
    candidates.push(
      candidate("strong-q1", { skillId: "strong-skill", difficulty: 5 }),
    );

    const masteryBySkill = new Map<string, SkillMasteryState>([
      ["weak-skill", mastery({ skillId: "weak-skill", masteryScore: 30 })],
      ["strong-skill", mastery({ skillId: "strong-skill", masteryScore: 80 })],
    ]);

    const result = selectAdaptiveMission(
      buildInput({
        candidates,
        masteryBySkill,
        activeSubjectSlugs: ["mathematics"],
      }),
    );

    expect(result.items).toHaveLength(16);
    expect(result.fallbackCount).toBeGreaterThan(0);
  });
});

describe("selectAdaptiveMission — capacity", () => {
  it("uses all unique eligible questions when fewer than 16 exist", () => {
    const candidates = Array.from({ length: 10 }, (_, i) => candidate(`q${i}`));
    const result = selectAdaptiveMission(
      buildInput({ candidates, masteryBySkill: new Map() }),
    );

    expect(result.items).toHaveLength(10);
    expect(result.capacityWarning).toBe(true);
  });

  it("returns an empty mission when there are zero eligible questions", () => {
    const result = selectAdaptiveMission(
      buildInput({ candidates: [], masteryBySkill: new Map() }),
    );

    expect(result.items).toHaveLength(0);
    expect(result.capacityWarning).toBe(true);
  });
});

describe("selectAdaptiveMission — new learner baseline", () => {
  it("builds a balanced baseline mission when there is no mastery data at all", () => {
    const candidates: QuestionCandidate[] = [];
    for (const subject of SUBJECTS) {
      for (let i = 0; i < 10; i += 1) {
        candidates.push(
          candidate(`${subject}-q${i}`, {
            subjectSlug: subject,
            subjectId: `subject-${subject}`,
            skillId: `${subject}-skill`,
            difficulty: (i % 5) + 1,
          }),
        );
      }
    }

    const result = selectAdaptiveMission(
      buildInput({ candidates, masteryBySkill: new Map() }),
    );

    expect(result.items).toHaveLength(16);
    const subjectCounts = countBySubject(result.items);
    for (const subject of SUBJECTS) {
      expect(subjectCounts[subject] ?? 0).toBeGreaterThan(0);
    }
  });

  it("includes at most 2 difficulty-4 questions and no difficulty-5 for a new learner when enough easier questions exist", () => {
    const candidates: QuestionCandidate[] = [];
    for (const subject of SUBJECTS) {
      for (let i = 0; i < 20; i += 1) {
        candidates.push(
          candidate(`${subject}-q${i}`, {
            subjectSlug: subject,
            subjectId: `subject-${subject}`,
            skillId: `${subject}-skill`,
            difficulty: (i % 5) + 1,
          }),
        );
      }
    }

    const result = selectAdaptiveMission(
      buildInput({ candidates, masteryBySkill: new Map() }),
    );

    const d4Count = result.items.filter((i) => i.difficulty === 4).length;
    const d5Count = result.items.filter((i) => i.difficulty === 5).length;
    expect(d4Count).toBeLessThanOrEqual(2);
    expect(d5Count).toBe(0);
  });

  it("allows difficulty-5 questions for a new learner only when the pool is otherwise insufficient", () => {
    const candidates: QuestionCandidate[] = [];
    for (const subject of SUBJECTS) {
      for (let i = 0; i < 3; i += 1) {
        candidates.push(
          candidate(`${subject}-q${i}`, {
            subjectSlug: subject,
            subjectId: `subject-${subject}`,
            skillId: `${subject}-skill`,
            difficulty: 5,
          }),
        );
      }
    }

    const result = selectAdaptiveMission(
      buildInput({ candidates, masteryBySkill: new Map() }),
    );

    expect(result.items).toHaveLength(12);
    expect(result.items.every((i) => i.difficulty === 5)).toBe(true);
  });
});

function countBySubject(
  items: { subjectSlug: string }[],
): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item.subjectSlug] = (acc[item.subjectSlug] ?? 0) + 1;
    return acc;
  }, {});
}

describe("selectAdaptiveMission — subject balance", () => {
  it("gives every active subject at least 2 questions when enough candidates exist", () => {
    const result = selectAdaptiveMission(buildInput());
    const counts = countBySubject(result.items);

    for (const subject of SUBJECTS) {
      expect(counts[subject] ?? 0).toBeGreaterThanOrEqual(
        DEFAULT_ADAPTIVE_CONFIG.subjectSoftMinimum,
      );
    }
  });

  it("relaxes the subject cap when weak/review demand is concentrated in one subject", () => {
    // Every weak/due skill lives in mathematics; there should be more than
    // the soft cap of mathematics questions rather than an artificial block.
    const candidates: QuestionCandidate[] = [];
    const masteryBySkill = new Map<string, SkillMasteryState>();

    for (let skillIndex = 0; skillIndex < 8; skillIndex += 1) {
      const skillId = `math-weak-${skillIndex}`;
      masteryBySkill.set(skillId, mastery({ skillId, masteryScore: 25 }));
      for (let q = 0; q < 2; q += 1) {
        candidates.push(
          candidate(`math-weak-${skillIndex}-q${q}`, {
            subjectSlug: "mathematics",
            subjectId: "subject-mathematics",
            skillId,
            difficulty: 2,
          }),
        );
      }
    }
    // A thin scattering of other subjects so they can still contribute a
    // little, but not enough to displace the concentrated weak demand.
    for (const subject of [
      "english",
      "verbal-reasoning",
      "non-verbal-reasoning",
    ]) {
      candidates.push(
        candidate(`${subject}-only-q`, {
          subjectSlug: subject,
          subjectId: `subject-${subject}`,
          skillId: `${subject}-skill`,
          difficulty: 2,
        }),
      );
    }

    const result = selectAdaptiveMission(
      buildInput({ candidates, masteryBySkill, activeSubjectSlugs: SUBJECTS }),
    );

    const counts = countBySubject(result.items);
    expect(counts.mathematics ?? 0).toBeGreaterThan(
      DEFAULT_ADAPTIVE_CONFIG.subjectSoftCap,
    );
  });
});

describe("selectAdaptiveMission — difficulty adaptation", () => {
  it("prefers low difficulty for a very weak skill when it must choose among more candidates than it needs", () => {
    // 4 candidates at every difficulty (20 total) for one weak skill, so the
    // weak_skill category (target 7) has to choose which ones to take —
    // with only 5 total candidates (one per difficulty) every one of them
    // would be picked regardless of preference, which wouldn't actually
    // test ranking.
    const candidates: QuestionCandidate[] = [];
    for (let d = 1; d <= 5; d += 1) {
      for (let copy = 0; copy < 4; copy += 1) {
        candidates.push(
          candidate(`weak-d${d}-c${copy}`, {
            skillId: "very-weak",
            difficulty: d,
          }),
        );
      }
    }
    const masteryBySkill = new Map([
      ["very-weak", mastery({ skillId: "very-weak", masteryScore: 20 })],
    ]);

    const result = selectAdaptiveMission(
      buildInput({
        candidates,
        masteryBySkill,
        activeSubjectSlugs: ["mathematics"],
      }),
    );
    const weakPicks = result.items.filter(
      (i) => i.skillId === "very-weak" && i.reason === "weak_skill",
    );

    expect(weakPicks.length).toBeGreaterThan(0);
    expect(weakPicks.every((pick) => pick.difficulty <= 3)).toBe(true);
  });

  it("prefers high difficulty for a highly mastered skill's coverage/challenge pick", () => {
    const candidates = [1, 2, 3, 4, 5].map((d) =>
      candidate(`strong-d${d}`, { skillId: "very-strong", difficulty: d }),
    );
    const masteryBySkill = new Map([
      [
        "very-strong",
        mastery({
          skillId: "very-strong",
          masteryScore: 95,
          totalAttempts: 20,
        }),
      ],
    ]);

    const result = selectAdaptiveMission(
      buildInput({ candidates, masteryBySkill }),
    );
    const picks = result.items.filter((i) => i.skillId === "very-strong");

    expect(picks.length).toBeGreaterThan(0);
    expect(Math.max(...picks.map((p) => p.difficulty))).toBeGreaterThanOrEqual(
      4,
    );
  });

  it("prefers difficulty 2-3 for an untested skill", () => {
    const candidates = [1, 2, 3, 4, 5].map((d) =>
      candidate(`untested-d${d}`, { skillId: "untested-skill", difficulty: d }),
    );

    const result = selectAdaptiveMission(
      buildInput({
        candidates: [...buildLargePool().candidates, ...candidates],
      }),
    );
    const untestedPicks = result.items.filter(
      (i) => i.skillId === "untested-skill",
    );

    if (untestedPicks.length > 0) {
      for (const pick of untestedPicks) {
        expect([2, 3]).toContain(pick.difficulty);
      }
    }
  });
});

describe("selectAdaptiveMission — recent-question cooldown", () => {
  it("excludes a recently answered question from weak-skill selection when alternatives exist", () => {
    const candidates = [
      candidate("weak-recent", { skillId: "weak-skill", difficulty: 2 }),
      ...Array.from({ length: 10 }, (_, i) =>
        candidate(`weak-fresh-${i}`, { skillId: "weak-skill", difficulty: 2 }),
      ),
    ];
    const masteryBySkill = new Map([
      ["weak-skill", mastery({ skillId: "weak-skill", masteryScore: 30 })],
    ]);
    const recentAttemptsByQuestion = new Map([
      [
        "weak-recent",
        new Date(REF.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      ],
    ]);

    const result = selectAdaptiveMission(
      buildInput({ candidates, masteryBySkill, recentAttemptsByQuestion }),
    );

    const weakPicks = result.items.filter((i) => i.reason === "weak_skill");
    expect(weakPicks.some((i) => i.questionId === "weak-recent")).toBe(false);
  });

  it("overrides cooldown for a due-review question when no other candidate exists", () => {
    const candidates = [
      candidate("due-recent-only", { skillId: "due-skill", difficulty: 2 }),
    ];
    const masteryBySkill = new Map([
      [
        "due-skill",
        mastery({
          skillId: "due-skill",
          masteryScore: 55,
          nextReviewAt: new Date(
            REF.getTime() - 2 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        }),
      ],
    ]);
    const recentAttemptsByQuestion = new Map([
      [
        "due-recent-only",
        new Date(REF.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      ],
    ]);

    const result = selectAdaptiveMission(
      buildInput({ candidates, masteryBySkill, recentAttemptsByQuestion }),
    );

    expect(result.items.some((i) => i.questionId === "due-recent-only")).toBe(
      true,
    );
  });

  it("overrides cooldown for a weak skill when it is the only remaining candidate", () => {
    const candidates = [
      candidate("weak-only-recent", { skillId: "weak-only", difficulty: 2 }),
    ];
    const masteryBySkill = new Map([
      ["weak-only", mastery({ skillId: "weak-only", masteryScore: 25 })],
    ]);
    const recentAttemptsByQuestion = new Map([
      [
        "weak-only-recent",
        new Date(REF.getTime() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      ],
    ]);

    const result = selectAdaptiveMission(
      buildInput({ candidates, masteryBySkill, recentAttemptsByQuestion }),
    );

    expect(result.items.some((i) => i.questionId === "weak-only-recent")).toBe(
      true,
    );
  });
});

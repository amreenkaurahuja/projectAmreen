import { describe, expect, it } from "vitest";
import {
  buildMissionSeed,
  createSeededRandom,
  createSeededRandomFromString,
  hashStringToSeed,
  seededShuffle,
} from "@/modules/adaptive-learning/seeded-random";

describe("hashStringToSeed", () => {
  it("is deterministic for the same input", () => {
    expect(hashStringToSeed("learner-1:2026-07-21")).toBe(
      hashStringToSeed("learner-1:2026-07-21"),
    );
  });

  it("differs for different inputs", () => {
    expect(hashStringToSeed("learner-1:2026-07-21")).not.toBe(
      hashStringToSeed("learner-2:2026-07-21"),
    );
    expect(hashStringToSeed("learner-1:2026-07-21")).not.toBe(
      hashStringToSeed("learner-1:2026-07-22"),
    );
  });
});

describe("createSeededRandom", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const sequenceA = Array.from({ length: 5 }, () => a());
    const sequenceB = Array.from({ length: 5 }, () => b());
    expect(sequenceA).toEqual(sequenceB);
  });

  it("produces a different sequence for a different seed", () => {
    const a = createSeededRandom(1);
    const b = createSeededRandom(2);
    const sequenceA = Array.from({ length: 5 }, () => a());
    const sequenceB = Array.from({ length: 5 }, () => b());
    expect(sequenceA).not.toEqual(sequenceB);
  });

  it("always yields values in [0, 1)", () => {
    const random = createSeededRandom(7);
    for (let i = 0; i < 100; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("createSeededRandomFromString", () => {
  it("is deterministic for the same seed string", () => {
    const a = createSeededRandomFromString("learner-1:2026-07-21");
    const b = createSeededRandomFromString("learner-1:2026-07-21");
    expect(a()).toBe(b());
  });
});

describe("seededShuffle", () => {
  it("is deterministic for the same seed", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffledA = seededShuffle(items, createSeededRandom(123));
    const shuffledB = seededShuffle(items, createSeededRandom(123));
    expect(shuffledA).toEqual(shuffledB);
  });

  it("produces a different order for a different seed", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffledA = seededShuffle(items, createSeededRandom(1));
    const shuffledB = seededShuffle(items, createSeededRandom(2));
    expect(shuffledA).not.toEqual(shuffledB);
  });

  it("never mutates the input array", () => {
    const items = [1, 2, 3];
    const copy = [...items];
    seededShuffle(items, createSeededRandom(1));
    expect(items).toEqual(copy);
  });

  it("preserves the same set of elements", () => {
    const items = ["a", "b", "c", "d", "e"];
    const shuffled = seededShuffle(items, createSeededRandom(9));
    expect([...shuffled].sort()).toEqual([...items].sort());
  });
});

describe("buildMissionSeed", () => {
  it("combines learnerId and missionDate deterministically", () => {
    expect(buildMissionSeed("learner-1", "2026-07-21")).toBe(
      "learner-1:2026-07-21",
    );
  });

  it("differs for a different learner or date", () => {
    expect(buildMissionSeed("learner-1", "2026-07-21")).not.toBe(
      buildMissionSeed("learner-2", "2026-07-21"),
    );
    expect(buildMissionSeed("learner-1", "2026-07-21")).not.toBe(
      buildMissionSeed("learner-1", "2026-07-22"),
    );
  });
});

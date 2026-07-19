import { describe, expect, it } from "vitest";
import { learnerSchema } from "@/lib/validation/learner";
describe("learnerSchema", () => {
  it("accepts a valid learner", () => {
    expect(
      learnerSchema.parse({
        displayName: "Amreen",
        schoolYear: 5,
        examTarget: "11+",
      }),
    ).toEqual({ displayName: "Amreen", schoolYear: 5, examTarget: "11+" });
  });
  it("rejects an invalid school year", () => {
    expect(
      learnerSchema.safeParse({ displayName: "Amreen", schoolYear: 14 })
        .success,
    ).toBe(false);
  });
});

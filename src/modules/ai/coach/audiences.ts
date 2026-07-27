/** Single source of truth for valid audiences — referenced by coach.types.ts, the DTO Zod schema, and prompt selection. */
export const AUDIENCES = ["learner", "parent"] as const;

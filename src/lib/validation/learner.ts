import { z } from "zod";

export const learnerSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required").max(80),
  schoolYear: z.coerce.number().int().min(1).max(13),
  examTarget: z.string().trim().max(120).optional().default(""),
});

export type LearnerInput = z.infer<typeof learnerSchema>;

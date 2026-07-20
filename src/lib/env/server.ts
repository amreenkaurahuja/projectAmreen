import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  APP_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
});

export function getServerEnv() {
  return serverEnvSchema.parse({
    APP_ENV: process.env.APP_ENV,
  });
}

import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  APP_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
});

export function getServerEnv() {
  return serverEnvSchema.parse({
    APP_ENV: process.env.APP_ENV,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
}

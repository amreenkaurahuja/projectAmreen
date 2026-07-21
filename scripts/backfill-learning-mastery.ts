// Offline administrative script: computes learner_skill_mastery rows for
// every question_attempts row answered before the mastery engine existed.
//
// Not exposed as a route or reachable from the running app — run manually
// from a trusted machine. Authenticates with SUPABASE_SERVICE_ROLE_KEY
// (bypasses RLS), which is why this lives here rather than in application
// code (see docs/Database.md — the app itself never uses this key).
//
// Usage:
//   npm run backfill:learning-mastery
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
// .env.local (validated by scripts/env.ts, same as scripts/seedQuestions.ts).
//
// Safe to re-run: it reuses the exact same idempotency mechanism as the
// live answer-submission path (an atomic conditional UPDATE claiming
// question_attempts.mastery_processed_at). Attempts already processed —
// whether by a real learner answering live, or by a previous run of this
// script — are skipped, not reprocessed. Processes attempts strictly in
// answered_at order (tie-broken by id) so streaks, mastery deltas, and
// review scheduling come out identical to how they'd have been computed
// live, one attempt at a time.
//
// Known v1 limitation: loads all still-unprocessed attempts into memory in
// a single query rather than paging through them. Fine at this project's
// current data volume (a small number of families); would need cursor-based
// pagination if the question_attempts table grows very large.
import { createClient } from "@supabase/supabase-js";
import { getSeedEnv } from "./env";
import { SupabaseMasteryRepository } from "../src/modules/learning-profile/mastery.repository";
import { MasteryService } from "../src/modules/learning-profile/mastery.service";

interface BackfillAttemptRow {
  id: string;
  question_id: string;
  is_correct: boolean;
  response_ms: number;
  answered_at: string;
  mission_items: {
    missions: {
      learner_id: string;
    };
  };
}

/**
 * Every other MasteryRepository method is plain data access with no notion
 * of "who is asking" — only assertLearnerOwned enforces the
 * parent-owns-learner check that matters for a browser-originated request.
 * This script IS the trusted boundary (a human running it locally with the
 * service-role key), so that check is a deliberate no-op here. This
 * override must never be used by any request-handling code path.
 */
class TrustedBackfillMasteryRepository extends SupabaseMasteryRepository {
  override async assertLearnerOwned(): Promise<void> {}
}

async function main() {
  const env = getSeedEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const masteryService = new MasteryService(
    new TrustedBackfillMasteryRepository(supabase),
  );

  const { data, error } = await supabase
    .from("question_attempts")
    .select(
      "id,question_id,is_correct,response_ms,answered_at,mission_items!inner(missions!inner(learner_id))",
    )
    .is("mastery_processed_at", null)
    .order("answered_at", { ascending: true })
    .order("id", { ascending: true });

  if (error) throw error;

  const rows = (data ?? []) as unknown as BackfillAttemptRow[];
  console.log(`Found ${rows.length} unprocessed attempt(s) to backfill.\n`);

  let processed = 0;
  let alreadyProcessed = 0;
  let noResolvableSkill = 0;
  let errors = 0;

  for (const row of rows) {
    const learnerId = row.mission_items.missions.learner_id;

    const outcome = await masteryService.processQuestionAttempt({
      learnerId,
      attemptId: row.id,
      questionId: row.question_id,
      isCorrect: row.is_correct,
      responseMs: row.response_ms,
      answeredAt: new Date(row.answered_at),
    });

    if (outcome.processed) {
      processed += 1;
    } else if (outcome.reason === "already-processed") {
      alreadyProcessed += 1;
    } else if (outcome.reason === "no-resolvable-skill") {
      noResolvableSkill += 1;
    } else {
      errors += 1;
    }

    const done = processed + alreadyProcessed + noResolvableSkill + errors;
    if (done % 100 === 0 || done === rows.length) {
      console.log(`Progress: ${done}/${rows.length}`);
    }
  }

  console.log("\nBackfill complete.");
  console.log(`  Processed:            ${processed}`);
  console.log(`  Already processed:    ${alreadyProcessed}`);
  console.log(`  No resolvable skill:  ${noResolvableSkill}`);
  console.log(`  Errors:               ${errors}`);

  if (errors > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error("Backfill failed:", error);
  process.exitCode = 1;
});

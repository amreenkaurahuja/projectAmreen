import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  MissionAccessError,
  MissionNotFoundError,
} from "@/modules/missions/mission.repository";
import { SupabaseMissionPlayerRepository } from "@/modules/missions/mission-player.repository";
import { MissionPlayerService } from "@/modules/missions/mission-player.service";
import { SupabaseMissionCompletionRepository } from "@/modules/missions/mission-completion.repository";
import { MissionCompletionService } from "@/modules/missions/mission-completion.service";
import type { MissionReview } from "@/modules/missions/mission-completion.types";
import { QuestionExplainerFlow } from "@/components/question-explainer/question-explainer-flow";

const paramsSchema = z.object({
  learner: z.string().uuid(),
  mission: z.string().uuid(),
});

// Per-learner, per-attempt review data — must always be recomputed from
// persisted attempts, never served from a cached RSC payload.
export const dynamic = "force-dynamic";

export default async function MissionReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ learner?: string; mission?: string }>;
}) {
  const user = await requireUser();
  const parsed = paramsSchema.safeParse(await searchParams);

  if (!parsed.success) {
    redirect("/parent/dashboard");
  }

  const { learner: learnerId, mission: missionId } = parsed.data;
  const supabase = await createClient();

  const { data: owned } = await supabase
    .from("learners")
    .select("id")
    .eq("id", learnerId)
    .eq("parent_id", user.id)
    .maybeSingle();
  if (!owned) redirect("/parent/dashboard");

  const completionService = new MissionCompletionService(
    new MissionPlayerService(
      new SupabaseMissionPlayerRepository(supabase as SupabaseClient),
    ),
    new SupabaseMissionCompletionRepository(supabase as SupabaseClient),
  );

  let review: MissionReview;
  try {
    review = await completionService.getReview(learnerId, missionId);
  } catch (error) {
    if (error instanceof MissionAccessError) redirect("/parent/dashboard");
    if (error instanceof MissionNotFoundError) notFound();
    throw error;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link
        className="text-sm font-medium underline"
        href={`/learner/dashboard?learner=${learnerId}`}
      >
        ← {review.learnerName}&apos;s dashboard
      </Link>

      <h1 className="mt-5 text-3xl font-semibold">Review Mistakes</h1>
      <p className="mt-2 text-neutral-600">
        {review.mistakes.length} of {review.answeredCount} answered questions
        need another look.
      </p>

      {review.mistakes.length === 0 ? (
        <div className="mt-8 rounded-3xl border p-8 text-center shadow-sm">
          <p className="text-5xl" aria-hidden="true">
            🌟
          </p>
          <h2 className="mt-4 text-2xl font-semibold">Perfect score</h2>
          <p className="mt-2 text-neutral-600">
            Every answered question was correct — brilliant work.
          </p>
          <a
            className="mt-6 inline-block rounded-xl bg-neutral-950 px-6 py-3 font-medium text-white"
            href={`/learner/dashboard?learner=${learnerId}`}
          >
            Return to Dashboard
          </a>
        </div>
      ) : (
        <>
          <ul className="mt-8 space-y-5">
            {review.mistakes.map((mistake, index) => (
              <li
                key={mistake.missionItemId}
                className="rounded-3xl border p-6 shadow-sm"
              >
                <p className="text-sm text-neutral-500">
                  Question {index + 1} · {mistake.subjectName}
                  {mistake.topicName ? ` · ${mistake.topicName}` : ""}
                </p>
                <h2 className="mt-2 text-lg leading-relaxed font-semibold">
                  {mistake.prompt}
                </h2>
                <div className="mt-4 grid gap-2 text-sm">
                  <p className="rounded-xl bg-red-50 px-4 py-2 text-red-700">
                    Your answer: {mistake.selectedOptionLabel}
                  </p>
                  <p className="rounded-xl bg-green-50 px-4 py-2 text-green-700">
                    Correct answer: {mistake.correctOptionLabel}
                  </p>
                </div>
                {mistake.explanation && (
                  <p className="mt-4 text-sm text-neutral-700">
                    {mistake.explanation}
                  </p>
                )}
                <QuestionExplainerFlow
                  attemptId={mistake.attemptId}
                  selectedOptionLabel={mistake.selectedOptionLabel}
                  correctOptionLabel={mistake.correctOptionLabel}
                />
              </li>
            ))}
          </ul>

          <a
            className="mt-8 inline-block rounded-xl bg-neutral-950 px-6 py-3 font-medium text-white"
            href={`/learner/dashboard?learner=${learnerId}`}
          >
            Return to Dashboard
          </a>
        </>
      )}
    </main>
  );
}

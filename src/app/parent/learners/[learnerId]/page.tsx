import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import {
  ParentDashboardAccessError,
  SupabaseParentDashboardRepository,
} from "@/modules/parent-dashboard/dashboard.repository";
import { ParentDashboardService } from "@/modules/parent-dashboard/dashboard.service";
import type { ParentDashboardData } from "@/modules/parent-dashboard/dashboard.types";
import { SupabaseMasteryRepository } from "@/modules/learning-profile/mastery.repository";
import { SupabaseAdaptiveDataRepository } from "@/modules/adaptive-learning/adaptive-mission.repository";
import { SupabaseMissionCompletionRepository } from "@/modules/missions/mission-completion.repository";

const paramsSchema = z.object({ learnerId: z.string().uuid() });

// Per-learner analytics — must always be recomputed from persisted
// mastery/mission data, never served from a cached RSC payload.
export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
});

function formatDate(isoDate: string): string {
  return dateFormatter.format(new Date(`${isoDate}T00:00:00.000Z`));
}

function formatMinutes(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return minutes <= 0 ? "< 1 min" : `${minutes} min`;
}

function formatMasteryChange(value: number): string {
  if (value > 0) return `+${value}`;
  return `${value}`;
}

export default async function ParentLearnerInsightsPage({
  params,
}: {
  params: Promise<{ learnerId: string }>;
}) {
  await requireUser();
  const parsedParams = paramsSchema.safeParse(await params);
  if (!parsedParams.success) {
    redirect("/parent/dashboard");
  }

  const supabase = await createClient();
  const service = new ParentDashboardService(
    new SupabaseParentDashboardRepository(supabase as SupabaseClient),
    new SupabaseMasteryRepository(supabase as SupabaseClient),
    new SupabaseAdaptiveDataRepository(supabase as SupabaseClient),
    new SupabaseMissionCompletionRepository(supabase as SupabaseClient),
  );

  let data: ParentDashboardData;
  try {
    data = await service.getDashboardData(parsedParams.data.learnerId);
  } catch (error) {
    if (error instanceof ParentDashboardAccessError) {
      redirect("/parent/dashboard");
    }
    throw error;
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link className="text-sm font-medium underline" href="/parent/dashboard">
        ← Parent dashboard
      </Link>

      <header className="mt-5">
        <p className="text-sm font-medium tracking-wide text-neutral-500 uppercase">
          Learning insights
        </p>
        <h1 className="mt-1 text-3xl font-semibold">{data.learnerName}</h1>
      </header>

      {!data.hasData ? (
        <p className="mt-8 rounded-2xl border p-6 text-neutral-600">
          Complete your first mission to start building learning insights.
        </p>
      ) : (
        <>
          <section aria-labelledby="learning-health-heading" className="mt-8">
            <h2 id="learning-health-heading" className="text-xl font-semibold">
              Overall Learning Health
            </h2>
            <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border p-4">
                <dt className="text-sm text-neutral-500">Overall Mastery</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {data.learningHealth.overallMasteryScore ?? "—"}%
                </dd>
              </div>
              <div className="rounded-2xl border p-4">
                <dt className="text-sm text-neutral-500">Overall Accuracy</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {data.learningHealth.overallAccuracy ?? "—"}%
                </dd>
              </div>
              <div className="rounded-2xl border p-4">
                <dt className="text-sm text-neutral-500">Questions Answered</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {data.learningHealth.totalQuestionsAnswered}
                </dd>
              </div>
              <div className="rounded-2xl border p-4">
                <dt className="text-sm text-neutral-500">Total Study Time</dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {formatMinutes(data.learningHealth.totalStudyTimeMs)}
                </dd>
              </div>
              <div className="rounded-2xl border p-4">
                <dt className="text-sm text-neutral-500">
                  Current Learning Streak
                </dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {data.learningHealth.currentStreakDays}{" "}
                  {data.learningHealth.currentStreakDays === 1 ? "day" : "days"}
                </dd>
                <p className="mt-1 text-xs text-neutral-500">
                  Longest: {data.learningHealth.longestStreakDays}{" "}
                  {data.learningHealth.longestStreakDays === 1 ? "day" : "days"}{" "}
                  · {data.learningHealth.daysLearnedThisMonth} days this month
                </p>
              </div>
              <div className="rounded-2xl border p-4">
                <dt className="text-sm text-neutral-500">
                  Skills Due For Review
                </dt>
                <dd className="mt-1 text-2xl font-semibold">
                  {data.learningHealth.skillsDueForReviewCount}
                </dd>
              </div>
            </dl>
          </section>

          {data.recommendations.length > 0 && (
            <section aria-labelledby="recommendations-heading" className="mt-9">
              <h2
                id="recommendations-heading"
                className="text-xl font-semibold"
              >
                Recommendations
              </h2>
              <ul className="mt-4 space-y-3">
                {data.recommendations.map((recommendation) => (
                  <li
                    key={recommendation.type}
                    className="rounded-2xl border p-4 text-sm"
                  >
                    {recommendation.message}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.upcomingMissionPreview.focusSkillNames.length > 0 && (
            <section aria-labelledby="upcoming-heading" className="mt-9">
              <h2 id="upcoming-heading" className="text-xl font-semibold">
                Tomorrow&apos;s likely focus
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {data.upcomingMissionPreview.focusSkillNames.map((name) => (
                  <li
                    key={name}
                    className="rounded-full border px-4 py-2 text-sm font-medium"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="subjects-heading" className="mt-9">
            <h2 id="subjects-heading" className="text-xl font-semibold">
              Subjects
            </h2>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b text-left text-neutral-500">
                    <th className="py-2 pr-4 font-medium">Subject</th>
                    <th className="py-2 pr-4 font-medium">Mastery</th>
                    <th className="py-2 pr-4 font-medium">Confidence</th>
                    <th className="py-2 pr-4 font-medium">Accuracy</th>
                    <th className="py-2 pr-4 font-medium">Questions</th>
                    <th className="py-2 font-medium">Avg. response</th>
                  </tr>
                </thead>
                <tbody>
                  {data.subjectInsights.map((subject) => (
                    <tr
                      key={subject.subjectId}
                      className="border-b last:border-0"
                    >
                      <td className="py-3 pr-4 font-medium">
                        {subject.subjectName}
                      </td>
                      <td className="py-3 pr-4">{subject.masteryLabel}</td>
                      <td className="py-3 pr-4">{subject.confidenceScore}%</td>
                      <td className="py-3 pr-4">{subject.accuracy}%</td>
                      <td className="py-3 pr-4">{subject.totalAttempts}</td>
                      <td className="py-3">
                        {subject.averageResponseMs !== null
                          ? `${Math.round(subject.averageResponseMs / 1000)}s`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section
            aria-labelledby="skills-heading"
            className="mt-9 grid gap-8 sm:grid-cols-2"
          >
            <div>
              <h2 id="skills-heading" className="text-xl font-semibold">
                Strongest skills
              </h2>
              <ul className="mt-4 space-y-3">
                {data.strongestSkills.map((skill) => (
                  <li
                    key={skill.skillId}
                    className="rounded-2xl border p-4 text-sm"
                  >
                    <p className="font-medium">{skill.skillName}</p>
                    <p className="mt-1 text-neutral-500">
                      {skill.subjectName} · Mastery {skill.masteryScore}% ·
                      Confidence {skill.confidenceScore}%
                      {skill.reviewDue ? " · Review due" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="text-xl font-semibold">Focus skills</h2>
              <ul className="mt-4 space-y-3">
                {data.focusSkills.map((skill) => (
                  <li
                    key={skill.skillId}
                    className="rounded-2xl border p-4 text-sm"
                  >
                    <p className="font-medium">{skill.skillName}</p>
                    <p className="mt-1 text-neutral-500">
                      {skill.subjectName} · Mastery {skill.masteryScore}% ·
                      Confidence {skill.confidenceScore}%
                      {skill.reviewDue ? " · Review due" : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section aria-labelledby="weekly-heading" className="mt-9">
            <h2 id="weekly-heading" className="text-xl font-semibold">
              Weekly progress
            </h2>
            {data.weeklyProgress.length === 0 ? (
              <p className="mt-4 text-neutral-600">
                No completed learning sessions yet.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left text-neutral-500">
                      <th className="py-2 pr-4 font-medium">Date</th>
                      <th className="py-2 pr-4 font-medium">Questions</th>
                      <th className="py-2 pr-4 font-medium">Accuracy</th>
                      <th className="py-2 pr-4 font-medium">Time</th>
                      <th className="py-2 font-medium">Mastery change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.weeklyProgress.map((row) => (
                      <tr
                        key={row.missionId}
                        className="border-b last:border-0"
                      >
                        <td className="py-3 pr-4">
                          {formatDate(row.missionDate)}
                        </td>
                        <td className="py-3 pr-4">{row.questionCount}</td>
                        <td className="py-3 pr-4">
                          {row.accuracyPercent !== null
                            ? `${row.accuracyPercent}%`
                            : "—"}
                        </td>
                        <td className="py-3 pr-4">
                          {formatMinutes(row.totalResponseMs)}
                        </td>
                        <td className="py-3">
                          {formatMasteryChange(row.masteryChangeApprox)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section aria-labelledby="history-heading" className="mt-9">
            <h2 id="history-heading" className="text-xl font-semibold">
              Session history
            </h2>
            {data.sessionHistory.length === 0 ? (
              <p className="mt-4 text-neutral-600">
                No completed learning sessions yet.
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b text-left text-neutral-500">
                      <th className="py-2 pr-4 font-medium">Date</th>
                      <th className="py-2 pr-4 font-medium">Questions</th>
                      <th className="py-2 pr-4 font-medium">Accuracy</th>
                      <th className="py-2 pr-4 font-medium">Time</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 font-medium">
                        <span className="sr-only">Review</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.sessionHistory.map((row) => (
                      <tr
                        key={row.missionId}
                        className="border-b last:border-0"
                      >
                        <td className="py-3 pr-4">
                          {formatDate(row.missionDate)}
                        </td>
                        <td className="py-3 pr-4">{row.questionCount}</td>
                        <td className="py-3 pr-4">
                          {row.accuracyPercent !== null
                            ? `${row.accuracyPercent}%`
                            : "—"}
                        </td>
                        <td className="py-3 pr-4">
                          {formatMinutes(row.totalResponseMs)}
                        </td>
                        <td className="py-3 pr-4 capitalize">
                          {row.status.replace("_", " ")}
                        </td>
                        <td className="py-3">
                          {row.status === "completed" && (
                            <Link
                              className="font-medium underline"
                              href={`/learner/mission/review?learner=${data.learnerId}&mission=${row.missionId}`}
                            >
                              Review
                            </Link>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/require-user";
import { getCurriculumSubjects } from "@/lib/curriculum/catalogue";
import { createClient } from "@/lib/supabase/server";
import { SupabaseMissionRepository } from "@/modules/missions/mission.repository";
import { MissionService } from "@/modules/missions/mission.service";
import { SupabaseMasteryRepository } from "@/modules/learning-profile/mastery.repository";
import { MasteryService } from "@/modules/learning-profile/mastery.service";

const learnerIdSchema = z.string().uuid();

export default async function LearnerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ learner?: string }>;
}) {
  const user = await requireUser();
  const { learner } = await searchParams;
  const supabase = await createClient();

  let learnerId = learner;
  if (!learnerId) {
    const { data: firstLearner } = await supabase
      .from("learners")
      .select("id")
      .eq("parent_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!firstLearner) redirect("/parent/learners/new");
    learnerId = firstLearner.id;
    redirect(`/learner/dashboard?learner=${learnerId}`);
  }

  // A malformed learner id (e.g. a hand-edited URL) must not reach Supabase:
  // Postgrest rejects invalid UUID syntax with an error, and the mission
  // service throws on that error, which would otherwise crash this page
  // with an unhandled rejection inside the Promise.all below.
  if (!learnerIdSchema.safeParse(learnerId).success) notFound();

  const repository = new SupabaseMissionRepository(supabase as never);
  const missionService = new MissionService(repository);
  const masteryService = new MasteryService(
    new SupabaseMasteryRepository(supabase as never),
  );

  const [
    { data: profile },
    subjects,
    { data: progressRows },
    mission,
    learningProfile,
  ] = await Promise.all([
    supabase
      .from("learners")
      .select("id,display_name,school_year,exam_target")
      .eq("id", learnerId)
      .single(),
    getCurriculumSubjects(),
    supabase
      .from("learner_subject_progress")
      .select("subject_id,progress_percent,skills_mastered")
      .eq("learner_id", learnerId),
    missionService.getOrCreateTodaysMission(learnerId),
    masteryService.getLearnerProfileSummary(learnerId),
  ]);

  if (!profile) notFound();

  const progressBySubject = new Map(
    (progressRows ?? []).map((row) => [row.subject_id, row]),
  );
  const overallProgress = subjects.length
    ? Math.round(
        subjects.reduce(
          (sum, subject) =>
            sum + (progressBySubject.get(subject.id)?.progress_percent ?? 0),
          0,
        ) / subjects.length,
      )
    : 0;
  const progressPercent = mission.questionCount
    ? Math.round((mission.answeredCount / mission.questionCount) * 100)
    : 0;
  const missionAccuracy = mission.questionCount
    ? Math.round((mission.correctCount / mission.questionCount) * 100)
    : 0;
  const missionComplete = mission.status === "completed";

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <Link className="text-sm font-medium underline" href="/parent/dashboard">
        ← Parent dashboard
      </Link>

      <header className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium tracking-wide text-neutral-500 uppercase">
            Learner home
          </p>
          <h1 className="mt-1 text-3xl font-semibold">
            Welcome, {profile.display_name}
          </h1>
          <p className="mt-2 text-neutral-600">
            Year {profile.school_year}
            {profile.exam_target
              ? ` · Working towards ${profile.exam_target}`
              : ""}
          </p>
        </div>
        <div className="min-w-40 rounded-2xl border p-4">
          <p className="text-sm text-neutral-500">Overall progress</p>
          <p className="mt-1 text-2xl font-semibold">{overallProgress}%</p>
        </div>
      </header>

      <section className="mt-8 rounded-3xl bg-neutral-950 p-6 text-white">
        <p className="text-sm font-medium tracking-wide text-neutral-400 uppercase">
          Today&apos;s mission
        </p>
        <h2 className="mt-2 text-2xl font-semibold">
          {mission.questionCount} questions · about {mission.estimatedMinutes}{" "}
          minutes
        </h2>
        <p className="mt-2 max-w-2xl text-neutral-300">
          {missionComplete
            ? `Mission complete · ${mission.correctCount}/${mission.questionCount} correct · ${missionAccuracy}% accuracy`
            : `${mission.answeredCount} answered · ${progressPercent}% complete`}
        </p>
        {missionComplete && mission.completedAt && (
          <p className="mt-1 text-sm text-neutral-400">
            Completed {formatCompletedAt(mission.completedAt)}
          </p>
        )}
        <Link
          href={`/learner/mission?learner=${profile.id}&mission=${mission.missionId}`}
          prefetch={false}
          className="mt-5 inline-block rounded-xl bg-white px-5 py-3 font-semibold text-neutral-950"
        >
          {mission.answeredCount === 0
            ? "Start Mission"
            : missionComplete
              ? "Review Mission"
              : "Resume Mission"}{" "}
          →
        </Link>
      </section>

      <section className="mt-9" aria-labelledby="learning-profile-heading">
        <div>
          <p className="text-sm font-medium tracking-wide text-neutral-500 uppercase">
            Your progress
          </p>
          <h2 id="learning-profile-heading" className="text-2xl font-semibold">
            Learning Profile
          </h2>
        </div>

        {learningProfile.hasData ? (
          <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border p-4">
              <dt className="text-sm text-neutral-500">Overall Mastery</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {learningProfile.overallMasteryScore}%
              </dd>
            </div>
            <div className="rounded-2xl border p-4">
              <dt className="text-sm text-neutral-500">Accuracy</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {learningProfile.overallAccuracy}%
              </dd>
            </div>
            <div className="rounded-2xl border p-4">
              <dt className="text-sm text-neutral-500">Questions Answered</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {learningProfile.totalQuestionsAnswered}
              </dd>
            </div>
            <div className="rounded-2xl border p-4">
              <dt className="text-sm text-neutral-500">Strongest Subject</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {learningProfile.strongestSubject?.subjectName ?? "—"}
              </dd>
            </div>
            <div className="rounded-2xl border p-4">
              <dt className="text-sm text-neutral-500">Focus Area</dt>
              <dd className="mt-1 text-2xl font-semibold">
                {learningProfile.weakestSubject?.subjectName ?? "—"}
              </dd>
            </div>
            <div className="rounded-2xl border p-4">
              <dt className="text-sm text-neutral-500">
                Skills Due for Review
              </dt>
              <dd className="mt-1 text-2xl font-semibold">
                {learningProfile.skillsDueForReview.length}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-5 rounded-2xl border p-5 text-neutral-600">
            Complete your first mission to start building your learning profile.
          </p>
        )}
      </section>

      <section className="mt-9">
        <div>
          <p className="text-sm font-medium tracking-wide text-neutral-500 uppercase">
            Your learning path
          </p>
          <h2 className="text-2xl font-semibold">Subjects</h2>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {subjects.map((subject) => {
            const progress = progressBySubject.get(subject.id);
            const percent = progress?.progress_percent ?? 0;
            return (
              <Link
                key={subject.id}
                href={`/learner/subjects/${subject.slug}?learner=${profile.id}`}
                className="rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-4">
                  <span className="text-3xl" aria-hidden="true">
                    {subject.icon}
                  </span>
                  <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-700">
                    {percent}% complete
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-semibold">{subject.name}</h3>
                <p className="mt-2 text-sm text-neutral-600">
                  {subject.description}
                </p>
                <div className="mt-5 h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-neutral-900"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="mt-3 text-sm font-medium">View curriculum →</p>
              </Link>
            );
          })}
        </div>
      </section>
    </main>
  );
}

const completedAtFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatCompletedAt(completedAt: string): string {
  return completedAtFormatter.format(new Date(completedAt));
}

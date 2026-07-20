import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getCurriculumSubjects } from "@/lib/curriculum/catalogue";
import { createClient } from "@/lib/supabase/server";

export default async function LearnerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ learner?: string }>;
}) {
  const user = await requireUser();
  const { learner } = await searchParams;
  const supabase = await createClient();

  if (!learner) {
    const { data: firstLearner } = await supabase
      .from("learners")
      .select("id")
      .eq("parent_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!firstLearner) redirect("/parent/learners/new");
    redirect(`/learner/dashboard?learner=${firstLearner.id}`);
  }
  const [{ data: profile }, subjects, { data: progressRows }] =
    await Promise.all([
      supabase
        .from("learners")
        .select("id,display_name,school_year,exam_target")
        .eq("id", learner)
        .single(),
      getCurriculumSubjects(),
      supabase
        .from("learner_subject_progress")
        .select("subject_id,progress_percent,skills_mastered")
        .eq("learner_id", learner),
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
        <h2 className="mt-2 text-xl font-semibold">Curriculum ready</h2>
        <p className="mt-2 max-w-2xl text-neutral-300">
          Explore your subjects and skills now. Personalised mission planning is
          introduced in Phase 3.
        </p>
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

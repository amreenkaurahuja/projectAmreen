import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getCurriculumSubject } from "@/lib/curriculum/catalogue";
import { createClient } from "@/lib/supabase/server";

export default async function SubjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ learner?: string }>;
}) {
  const user = await requireUser();
  const [{ slug }, { learner }] = await Promise.all([params, searchParams]);
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
    redirect(`/learner/subjects/${slug}?learner=${firstLearner.id}`);
  }
  const [{ data: learnerProfile }, subject] = await Promise.all([
    supabase
      .from("learners")
      .select("id,display_name")
      .eq("id", learner)
      .single(),
    getCurriculumSubject(slug),
  ]);

  if (!learnerProfile || !subject) notFound();

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link
        className="text-sm font-medium underline"
        href={`/learner/dashboard?learner=${learnerProfile.id}`}
      >
        ← {learnerProfile.display_name}&apos;s dashboard
      </Link>

      <header className="mt-6 rounded-3xl bg-neutral-950 p-7 text-white">
        <p className="text-4xl" aria-hidden="true">
          {subject.icon}
        </p>
        <h1 className="mt-3 text-3xl font-semibold">{subject.name}</h1>
        <p className="mt-2 max-w-2xl text-neutral-300">{subject.description}</p>
      </header>

      <section className="mt-8">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium tracking-wide text-neutral-500 uppercase">
              Curriculum map
            </p>
            <h2 className="text-2xl font-semibold">Topics and skills</h2>
          </div>
          <p className="text-sm text-neutral-500">
            {subject.topics.length} topics
          </p>
        </div>

        <div className="mt-5 space-y-4">
          {subject.topics.map((topic, index) => (
            <article key={topic.id} className="rounded-2xl border p-5">
              <div className="flex gap-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-sm font-semibold">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <h3 className="text-lg font-semibold">{topic.name}</h3>
                  <p className="mt-1 text-sm text-neutral-600">
                    {topic.description}
                  </p>
                  <ul className="mt-4 space-y-2">
                    {topic.skills.map((skill) => (
                      <li
                        key={skill.id}
                        className="rounded-xl bg-neutral-50 px-4 py-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-medium">{skill.name}</p>
                          <span className="text-xs text-neutral-500">
                            Level {skill.difficulty} · {skill.code}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-neutral-600">
                          {skill.description}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

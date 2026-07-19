import Link from "next/link";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { LogoutButton } from "@/components/auth/logout-button";

export default async function ParentDashboard() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: learners } = await supabase
    .from("learners")
    .select("id,display_name,school_year,exam_target")
    .order("created_at");
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <header className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-neutral-600">Signed in as {user.email}</p>
          <h1 className="text-3xl font-semibold">Parent dashboard</h1>
        </div>
        <LogoutButton />
      </header>
      <section className="mt-8 rounded-2xl border p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium">Learners</h2>
          <Link
            href="/parent/learners/new"
            className="rounded-xl bg-black px-4 py-2 text-white"
          >
            Add learner
          </Link>
        </div>
        {!learners?.length ? (
          <p className="mt-5 text-neutral-600">
            Create Amreen’s learner profile to begin.
          </p>
        ) : (
          <ul className="mt-5 space-y-3">
            {learners.map((l) => (
              <li key={l.id} className="rounded-xl border p-4">
                <Link
                  className="font-medium underline"
                  href={`/learner/dashboard?learner=${l.id}`}
                >
                  {l.display_name}
                </Link>
                <p className="text-sm text-neutral-600">
                  School year {l.school_year}
                  {l.exam_target ? ` · ${l.exam_target}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

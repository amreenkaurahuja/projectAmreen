import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
export default async function LearnerDashboard({
  searchParams,
}: {
  searchParams: Promise<{ learner?: string }>;
}) {
  await requireUser();
  const { learner } = await searchParams;
  if (!learner) notFound();
  const supabase = await createClient();
  const { data } = await supabase
    .from("learners")
    .select("display_name,school_year,exam_target")
    .eq("id", learner)
    .single();
  if (!data) notFound();
  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <Link className="text-sm underline" href="/parent/dashboard">
        ← Parent dashboard
      </Link>
      <h1 className="mt-5 text-3xl font-semibold">
        Hello, {data.display_name}
      </h1>
      <p className="mt-2 text-neutral-600">
        Year {data.school_year}
        {data.exam_target ? ` · Working towards ${data.exam_target}` : ""}
      </p>
      <section className="mt-8 rounded-2xl border p-6">
        <h2 className="text-xl font-medium">Today’s mission</h2>
        <p className="mt-3 text-neutral-600">
          No mission has been assigned yet. Mission planning arrives in Phase 4.
        </p>
      </section>
    </main>
  );
}

import { requireUser } from "@/lib/auth/require-user";
import { LearnerForm } from "@/components/learners/learner-form";
export default async function NewLearnerPage() {
  await requireUser();
  return (
    <main className="mx-auto max-w-lg px-6 py-10">
      <h1 className="text-3xl font-semibold">Create learner profile</h1>
      <p className="mt-2 text-neutral-600">
        Add only the information needed for learning.
      </p>
      <div className="mt-6">
        <LearnerForm />
      </div>
    </main>
  );
}

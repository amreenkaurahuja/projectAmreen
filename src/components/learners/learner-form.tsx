"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export function LearnerForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(e.currentTarget);
    const response = await fetch("/api/learners", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        displayName: form.get("displayName"),
        schoolYear: Number(form.get("schoolYear")),
        examTarget: form.get("examTarget"),
      }),
    });
    if (!response.ok) {
      const body = await response.json();
      setError(body.error ?? "Unable to create learner");
      setLoading(false);
      return;
    }
    router.push("/parent/dashboard");
    router.refresh();
  }
  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border p-6">
      <label className="block text-sm">
        Display name
        <input
          name="displayName"
          required
          maxLength={80}
          className="mt-1 w-full rounded-xl border px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        School year
        <select
          name="schoolYear"
          defaultValue="5"
          className="mt-1 w-full rounded-xl border px-3 py-2"
        >
          {Array.from({ length: 13 }, (_, i) => (
            <option key={i + 1} value={i + 1}>
              Year {i + 1}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        Exam target (optional)
        <input
          name="examTarget"
          maxLength={120}
          placeholder="For example: 11+"
          className="mt-1 w-full rounded-xl border px-3 py-2"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        disabled={loading}
        className="w-full rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "Saving…" : "Create learner"}
      </button>
    </form>
  );
}

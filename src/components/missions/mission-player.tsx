"use client";

import { useMemo, useState } from "react";
import { getInitialMissionIndex } from "@/lib/missions/resume";
import type { DailyMission } from "@/lib/missions/types";

export function MissionPlayer({
  initialMission,
}: {
  initialMission: DailyMission;
}) {
  const [mission, setMission] = useState(initialMission);
  const [index, setIndex] = useState(() =>
    getInitialMissionIndex(initialMission),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    correct: boolean;
    explanation: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const complete = index >= mission.questions.length;
  const accuracy = mission.totalQuestions
    ? Math.round((mission.correctAnswers / mission.totalQuestions) * 100)
    : 0;
  const question = mission.questions[index];
  const subjectSummary = useMemo(
    () =>
      Object.entries(
        mission.questions.reduce<Record<string, number>>((acc, q) => {
          acc[q.subjectName] = (acc[q.subjectName] ?? 0) + 1;
          return acc;
        }, {}),
      ),
    [mission.questions],
  );

  async function submit() {
    if (!question || !selected || saving) return;
    setSaving(true);
    const response = await fetch(`/api/missions/${mission.id}/answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        missionItemId: question.missionItemId,
        optionId: selected,
        responseMs: 0,
      }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      alert(result.error ?? "Could not save answer");
      return;
    }
    setFeedback({ correct: result.correct, explanation: question.explanation });
    setMission((current) => ({
      ...current,
      answeredQuestions: current.answeredQuestions + 1,
      correctAnswers: current.correctAnswers + (result.correct ? 1 : 0),
    }));
  }

  function next() {
    setIndex((current) => current + 1);
    setSelected(null);
    setFeedback(null);
  }

  if (complete)
    return (
      <main className="mx-auto max-w-2xl px-6 py-12 text-center">
        <div className="rounded-3xl border p-8 shadow-sm">
          <p className="text-5xl" aria-hidden="true">
            🎉
          </p>
          <h1 className="mt-4 text-3xl font-semibold">Mission complete!</h1>
          <p className="mt-2 text-neutral-600">Brilliant effort today.</p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-neutral-100 p-5">
              <p className="text-sm text-neutral-500">Correct</p>
              <p className="text-3xl font-semibold">
                {mission.correctAnswers}/{mission.totalQuestions}
              </p>
            </div>
            <div className="rounded-2xl bg-neutral-100 p-5">
              <p className="text-sm text-neutral-500">Accuracy</p>
              <p className="text-3xl font-semibold">{accuracy}%</p>
            </div>
          </div>
          <a
            className="mt-8 inline-block rounded-xl bg-neutral-950 px-6 py-3 font-medium text-white"
            href={`/learner/dashboard?learner=${mission.learnerId}`}
          >
            Back to dashboard
          </a>
        </div>
      </main>
    );

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex items-center justify-between text-sm text-neutral-600">
        <span>{question.subjectName}</span>
        <span>
          Question {index + 1} of {mission.totalQuestions}
        </span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full bg-neutral-950"
          style={{ width: `${((index + 1) / mission.totalQuestions) * 100}%` }}
        />
      </div>
      <section className="mt-8 rounded-3xl border p-6 shadow-sm">
        <h1 className="text-2xl leading-relaxed font-semibold">
          {question.prompt}
        </h1>
        <div className="mt-6 grid gap-3">
          {question.options.map((option) => (
            <button
              key={option.id}
              disabled={!!feedback}
              onClick={() => setSelected(option.id)}
              className={`rounded-2xl border p-4 text-left transition ${selected === option.id ? "border-neutral-950 bg-neutral-100" : "hover:bg-neutral-50"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        {feedback && (
          <div
            className={`mt-5 rounded-2xl p-4 ${feedback.correct ? "bg-green-50" : "bg-amber-50"}`}
          >
            <p className="font-semibold">
              {feedback.correct
                ? "Correct — well done!"
                : "Not quite — keep learning."}
            </p>
            <p className="mt-1 text-sm text-neutral-700">
              {feedback.explanation}
            </p>
          </div>
        )}
        <button
          onClick={feedback ? next : submit}
          disabled={!feedback && (!selected || saving)}
          className="mt-6 w-full rounded-xl bg-neutral-950 px-5 py-3 font-medium text-white disabled:opacity-40"
        >
          {feedback ? "Next question" : saving ? "Saving…" : "Check answer"}
        </button>
      </section>
      <div className="mt-6 flex flex-wrap gap-2">
        {subjectSummary.map(([name, count]) => (
          <span
            key={name}
            className="rounded-full bg-neutral-100 px-3 py-1 text-xs"
          >
            {name}: {count}
          </span>
        ))}
      </div>
    </main>
  );
}

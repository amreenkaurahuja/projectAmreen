"use client";

import { useMemo, useState } from "react";
import { buildCompletionSummary } from "@/modules/missions/mission-completion.calculations";
import type {
  MissionPlayer as MissionPlayerData,
  MissionPlayerQuestion,
  SubmitAnswerResult,
} from "@/modules/missions/mission-player.types";

export function MissionPlayer({
  initialMission,
  initialIndex,
  learnerName,
}: {
  initialMission: MissionPlayerData;
  /**
   * The first unanswered question's array index, computed server-side from
   * persisted attempts (see getInitialMissionIndex in mission/page.tsx).
   * Must be used as-is: never recomputed or defaulted to 0 on the client,
   * and never reset by an effect after mount.
   */
  initialIndex: number;
  learnerName: string;
}) {
  const [mission, setMission] = useState(initialMission);
  const [index, setIndex] = useState(initialIndex);

  const complete = index >= mission.questions.length;
  const question = mission.questions[index];

  const summary = useMemo(
    () => buildCompletionSummary(mission, learnerName),
    [mission, learnerName],
  );

  function applyAnswer(
    missionItemId: string,
    selectedOptionId: string,
    responseMs: number,
    answer: SubmitAnswerResult,
  ) {
    setMission((current) => ({
      ...current,
      status: answer.mission.status,
      answeredCount: answer.mission.answeredCount,
      correctCount: answer.mission.correctCount,
      completedAt: answer.mission.completedAt,
      questions: current.questions.map((item) =>
        item.missionItemId === missionItemId
          ? {
              ...item,
              attempt: {
                selectedOptionId,
                correctOptionId: answer.correctOptionId,
                isCorrect: answer.isCorrect,
                explanation: answer.explanation,
                responseMs,
              },
            }
          : item,
      ),
    }));
  }

  function goNext() {
    setIndex((current) => Math.min(current + 1, mission.questions.length));
  }

  function goPrevious() {
    setIndex((current) => Math.max(current - 1, 0));
  }

  if (complete) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12 text-center">
        <div className="rounded-3xl border p-8 shadow-sm">
          <p className="text-5xl" aria-hidden="true">
            🎉
          </p>
          <h1 className="mt-4 text-3xl font-semibold">Mission Complete</h1>
          <p className="mt-2 text-neutral-600">
            {summary.learnerName}, {summary.scoreMessage.toLowerCase()}!
          </p>
          <div className="mt-8 grid grid-cols-2 gap-4">
            <div className="rounded-2xl bg-neutral-100 p-5">
              <p className="text-sm text-neutral-500">Correct</p>
              <p className="text-3xl font-semibold">
                {summary.correctCount}/{summary.totalQuestions}
              </p>
            </div>
            <div className="rounded-2xl bg-neutral-100 p-5">
              <p className="text-sm text-neutral-500">Accuracy</p>
              <p className="text-3xl font-semibold">
                {summary.accuracyPercent}%
              </p>
            </div>
            <div className="rounded-2xl bg-neutral-100 p-5">
              <p className="text-sm text-neutral-500">Questions completed</p>
              <p className="text-3xl font-semibold">
                {summary.answeredCount}/{summary.totalQuestions}
              </p>
            </div>
            <div className="rounded-2xl bg-neutral-100 p-5">
              <p className="text-sm text-neutral-500">Time</p>
              <p className="text-3xl font-semibold">
                {summary.displayMinutes} min
              </p>
            </div>
          </div>
          <div className="mt-8 text-left">
            <p className="text-sm font-medium tracking-wide text-neutral-500 uppercase">
              Subject breakdown
            </p>
            <ul className="mt-3 grid gap-2">
              {summary.subjectBreakdown.map((subject) => (
                <li
                  key={subject.subjectSlug}
                  className="flex items-center justify-between rounded-xl bg-neutral-50 px-4 py-2 text-sm"
                >
                  <span>{subject.subjectName}</span>
                  <span className="font-medium">
                    {subject.correct}/{subject.attempted} ·{" "}
                    {subject.accuracyPercent}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <a
              href={`/learner/mission/review?learner=${mission.learnerId}&mission=${mission.missionId}`}
              className="rounded-xl border px-6 py-3 font-medium"
            >
              Review Mistakes
            </a>
            <a
              className="inline-block rounded-xl bg-neutral-950 px-6 py-3 font-medium text-white"
              href={`/learner/dashboard?learner=${mission.learnerId}`}
            >
              Return to Dashboard
            </a>
          </div>
        </div>
      </main>
    );
  }

  if (!question) return null;

  const progressPercent = mission.totalQuestions
    ? Math.round((mission.answeredCount / mission.totalQuestions) * 100)
    : 0;

  return (
    <QuestionCard
      key={question.missionItemId}
      question={question}
      missionId={mission.missionId}
      learnerId={mission.learnerId}
      position={index + 1}
      totalQuestions={mission.totalQuestions}
      progressPercent={progressPercent}
      canGoPrevious={index > 0}
      onPrevious={goPrevious}
      onNext={goNext}
      onAnswered={applyAnswer}
    />
  );
}

function QuestionCard({
  question,
  missionId,
  learnerId,
  position,
  totalQuestions,
  progressPercent,
  canGoPrevious,
  onPrevious,
  onNext,
  onAnswered,
}: {
  question: MissionPlayerQuestion;
  missionId: string;
  learnerId: string;
  position: number;
  totalQuestions: number;
  progressPercent: number;
  canGoPrevious: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onAnswered: (
    missionItemId: string,
    selectedOptionId: string,
    responseMs: number,
    answer: SubmitAnswerResult,
  ) => void;
}) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(
    question.attempt?.selectedOptionId ?? null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questionShownAt] = useState(() => Date.now());

  const hasSubmittedForSelection =
    Boolean(question.attempt) &&
    question.attempt?.selectedOptionId === selectedOptionId;
  const isChangingAnswer =
    Boolean(question.attempt) && !hasSubmittedForSelection;

  async function submit() {
    if (!selectedOptionId || submitting) return;
    setSubmitting(true);
    setError(null);
    const responseMs = Date.now() - questionShownAt;

    try {
      const response = await fetch(`/api/missions/${missionId}/attempts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          learnerId,
          missionItemId: question.missionItemId,
          optionId: selectedOptionId,
          responseMs,
        }),
      });

      const result = (await response.json()) as
        SubmitAnswerResult | { error: string };

      if (!response.ok) {
        setError("error" in result ? result.error : "Could not save answer");
        return;
      }

      onAnswered(
        question.missionItemId,
        selectedOptionId,
        responseMs,
        result as SubmitAnswerResult,
      );
    } catch {
      setError("Could not save answer. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <div className="flex items-center justify-between text-sm text-neutral-600">
        <span>
          {question.subjectName}
          {question.topicName ? ` · ${question.topicName}` : ""}
        </span>
        <span>
          Question {position} of {totalQuestions}
        </span>
      </div>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100"
        role="progressbar"
        aria-valuenow={progressPercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Mission progress"
      >
        <div
          className="h-full bg-neutral-950"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-neutral-500">
        {progressPercent}% complete
      </p>

      <section className="mt-8 rounded-3xl border p-6 shadow-sm">
        <h1 className="text-2xl leading-relaxed font-semibold">
          {question.prompt}
        </h1>

        <fieldset className="mt-6 grid gap-3">
          <legend className="sr-only">Answer options</legend>
          {question.options.map((option) => {
            const isSelected = selectedOptionId === option.id;
            const showResult = hasSubmittedForSelection;
            const isCorrectOption =
              showResult && question.attempt?.correctOptionId === option.id;
            const isWrongSelected =
              showResult && isSelected && !question.attempt?.isCorrect;

            return (
              <label
                key={option.id}
                className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-2xl border p-4 text-left text-base transition ${
                  isCorrectOption
                    ? "border-green-600 bg-green-50"
                    : isWrongSelected
                      ? "border-red-500 bg-red-50"
                      : isSelected
                        ? "border-neutral-950 bg-neutral-100"
                        : "hover:bg-neutral-50"
                }`}
              >
                <input
                  type="radio"
                  name={`mission-item-${question.missionItemId}`}
                  value={option.id}
                  checked={isSelected}
                  onChange={() => setSelectedOptionId(option.id)}
                  className="h-5 w-5"
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </fieldset>

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {error}
          </p>
        )}

        {hasSubmittedForSelection && question.attempt && (
          <div
            className={`mt-5 rounded-2xl p-4 ${
              question.attempt.isCorrect ? "bg-green-50" : "bg-amber-50"
            }`}
          >
            <p className="font-semibold">
              {question.attempt.isCorrect
                ? "Correct — well done!"
                : "Try again next time — here's why:"}
            </p>
            <p className="mt-1 text-sm text-neutral-700">
              {question.attempt.explanation}
            </p>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={onPrevious}
            disabled={!canGoPrevious}
            className="rounded-xl border px-5 py-3 font-medium disabled:opacity-40"
          >
            Previous
          </button>
          {hasSubmittedForSelection ? (
            <button
              onClick={onNext}
              className="flex-1 rounded-xl bg-neutral-950 px-5 py-3 font-medium text-white"
            >
              Continue
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!selectedOptionId || submitting}
              className="flex-1 rounded-xl bg-neutral-950 px-5 py-3 font-medium text-white disabled:opacity-40"
            >
              {submitting
                ? "Saving…"
                : isChangingAnswer
                  ? "Update answer"
                  : "Check answer"}
            </button>
          )}
        </div>
      </section>
    </main>
  );
}

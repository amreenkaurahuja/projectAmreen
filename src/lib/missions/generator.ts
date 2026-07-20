import type { SupabaseClient } from "@supabase/supabase-js";
import type { DailyMission } from "./types";

type RawMissionItem = {
  id: string;
  position: number;
  question_bank: {
    id: string;
    prompt: string;
    explanation: string;
    difficulty: number;
    subjects: { name: string; slug: string };
    question_options: Array<{ id: string; label: string; sort_order: number }>;
  };
  question_attempts: Array<{
    selected_option_id: string;
    is_correct: boolean;
  }> | null;
};

const MIX: Record<string, number> = {
  mathematics: 8,
  english: 4,
  "verbal-reasoning": 2,
  "non-verbal-reasoning": 2,
};

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

export async function getOrCreateDailyMission(
  supabase: SupabaseClient,
  learnerId: string,
): Promise<DailyMission> {
  const date = todayUtc();
  const { data: existing } = await supabase
    .from("missions")
    .select("id")
    .eq("learner_id", learnerId)
    .eq("mission_date", date)
    .maybeSingle();

  let missionId = existing?.id as string | undefined;
  if (!missionId) {
    const { data: mission, error: missionError } = await supabase
      .from("missions")
      .insert({
        learner_id: learnerId,
        mission_date: date,
        status: "ready",
        estimated_minutes: 20,
      })
      .select("id")
      .single();
    if (missionError) throw missionError;
    missionId = mission.id;

    let position = 1;
    for (const [subjectSlug, count] of Object.entries(MIX)) {
      const { data: questions, error } = await supabase
        .from("question_bank")
        .select("id, subjects!inner(slug)")
        .eq("subjects.slug", subjectSlug)
        .eq("is_active", true)
        .limit(count * 3);
      if (error) throw error;
      const chosen = [...(questions ?? [])]
        .sort(() => Math.random() - 0.5)
        .slice(0, count);
      if (chosen.length < count) {
        throw new Error(`Not enough active questions for ${subjectSlug}`);
      }
      const rows = chosen.map((question) => ({
        mission_id: missionId,
        question_id: question.id,
        position: position++,
      }));
      const { error: itemError } = await supabase
        .from("mission_items")
        .insert(rows);
      if (itemError) throw itemError;
    }
  }

  if (!missionId) throw new Error("Mission could not be created");
  return getMission(supabase, missionId);
}

export async function getMission(
  supabase: SupabaseClient,
  missionId: string,
): Promise<DailyMission> {
  const { data: mission, error } = await supabase
    .from("missions")
    .select("id,learner_id,mission_date,status,estimated_minutes")
    .eq("id", missionId)
    .single();
  if (error) throw error;

  const { data: items, error: itemError } = await supabase
    .from("mission_items")
    .select(
      `
      id, position,
      question_bank!inner(
        id,prompt,explanation,difficulty,
        subjects!inner(name,slug),
        question_options(id,label,sort_order)
      ),
      question_attempts(selected_option_id,is_correct)
    `,
    )
    .eq("mission_id", missionId)
    .order("position");
  if (itemError) throw itemError;

  const questions = ((items ?? []) as unknown as RawMissionItem[]).map(
    (item) => {
      const attempt = item.question_attempts?.[0] ?? null;
      const q = item.question_bank;
      return {
        missionItemId: item.id,
        questionId: q.id,
        subjectName: q.subjects.name,
        subjectSlug: q.subjects.slug,
        prompt: q.prompt,
        explanation: q.explanation,
        difficulty: q.difficulty,
        options: [...q.question_options]
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((option) => ({ id: option.id, label: option.label })),
        answeredOptionId: attempt?.selected_option_id ?? null,
        isCorrect: attempt?.is_correct ?? null,
      };
    },
  );
  const answered = questions.filter((q) => q.answeredOptionId).length;
  const correct = questions.filter((q) => q.isCorrect === true).length;

  return {
    id: mission.id,
    learnerId: mission.learner_id,
    missionDate: mission.mission_date,
    status: mission.status,
    estimatedMinutes: mission.estimated_minutes,
    totalQuestions: questions.length,
    answeredQuestions: answered,
    correctAnswers: correct,
    questions,
  };
}

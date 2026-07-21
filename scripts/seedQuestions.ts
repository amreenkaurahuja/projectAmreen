import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSeedEnv } from "./env";

const optionSchema = z.object({
  label: z.string().min(1).max(500),
  isCorrect: z.boolean(),
});

const questionSchema = z.object({
  subjectSlug: z.string().min(1),
  topicSlug: z.string().min(1),
  prompt: z.string().min(3).max(1000),
  explanation: z.string().max(1500),
  difficulty: z.number().int().min(1).max(5),
  options: z
    .array(optionSchema)
    .length(4)
    .refine(
      (options) => options.filter((option) => option.isCorrect).length === 1,
      "Each question must have exactly one correct option.",
    ),
});

const questionsSchema = z.array(questionSchema).min(1);

type Question = z.infer<typeof questionSchema>;

const seedEnv = getSeedEnv();

const supabase = createClient(
  seedEnv.NEXT_PUBLIC_SUPABASE_URL,
  seedEnv.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);

const here = dirname(fileURLToPath(import.meta.url));
const questionsPath = resolve(here, "../data/questions.json");

async function loadQuestions(): Promise<Question[]> {
  const raw = await readFile(questionsPath, "utf8");
  return questionsSchema.parse(JSON.parse(raw));
}

async function main() {
  const questions = await loadQuestions();

  const { data: subjects, error: subjectsError } = await supabase
    .from("subjects")
    .select("id, slug");
  if (subjectsError) throw subjectsError;

  const { data: topics, error: topicsError } = await supabase
    .from("topics")
    .select("id, subject_id, slug");
  if (topicsError) throw topicsError;

  const subjectBySlug = new Map(
    subjects.map((subject) => [subject.slug, subject.id]),
  );
  const topicByKey = new Map(
    topics.map((topic) => [`${topic.subject_id}:${topic.slug}`, topic.id]),
  );

  let seeded = 0;

  for (const question of questions) {
    const subjectId = subjectBySlug.get(question.subjectSlug);
    if (!subjectId) {
      throw new Error(`Subject not found: ${question.subjectSlug}`);
    }

    const topicId = topicByKey.get(`${subjectId}:${question.topicSlug}`);
    if (!topicId) {
      throw new Error(
        `Topic not found: ${question.subjectSlug}/${question.topicSlug}`,
      );
    }

    const { data: savedQuestion, error: questionError } = await supabase
      .from("question_bank")
      .upsert(
        {
          subject_id: subjectId,
          topic_id: topicId,
          prompt: question.prompt,
          explanation: question.explanation,
          difficulty: question.difficulty,
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "prompt" },
      )
      .select("id")
      .single();

    if (questionError) throw questionError;

    const { error: deleteOptionsError } = await supabase
      .from("question_options")
      .delete()
      .eq("question_id", savedQuestion.id);
    if (deleteOptionsError) throw deleteOptionsError;

    const { error: optionsError } = await supabase
      .from("question_options")
      .insert(
        question.options.map((option, index) => ({
          question_id: savedQuestion.id,
          label: option.label,
          is_correct: option.isCorrect,
          sort_order: index + 1,
        })),
      );
    if (optionsError) throw optionsError;

    seeded += 1;
    console.log(`Seeded ${seeded}/${questions.length}: ${question.prompt}`);
  }

  console.log(`\nDone. Seeded ${seeded} questions safely.`);
}

main().catch((error: unknown) => {
  console.error("Question seed failed:", error);
  process.exitCode = 1;
});

import { createClient } from "@/lib/supabase/server";
import type { CurriculumSubject } from "./types";

export async function getCurriculumSubjects(): Promise<CurriculumSubject[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subjects")
    .select("id,slug,name,description,icon,sort_order")
    .eq("is_active", true)
    .order("sort_order");

  if (error) throw new Error(`Unable to load subjects: ${error.message}`);
  return data ?? [];
}

export async function getCurriculumSubject(slug: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subjects")
    .select(
      `id,slug,name,description,icon,sort_order,
       topics(id,slug,name,description,sort_order,
         skills(id,code,name,description,difficulty,sort_order)
       )`,
    )
    .eq("slug", slug)
    .eq("is_active", true)
    .eq("topics.is_active", true)
    .eq("topics.skills.is_active", true)
    .single();

  if (error || !data) return null;

  const topics = (data.topics ?? [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((topic) => ({
      ...topic,
      skills: (topic.skills ?? []).sort((a, b) => a.sort_order - b.sort_order),
    }));

  return { ...data, topics };
}

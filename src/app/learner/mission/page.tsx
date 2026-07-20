import { redirect } from "next/navigation";
import { MissionPlayer } from "@/components/missions/mission-player";
import { requireUser } from "@/lib/auth/require-user";
import { getOrCreateDailyMission } from "@/lib/missions/generator";
import { createClient } from "@/lib/supabase/server";

export default async function MissionPage({
  searchParams,
}: {
  searchParams: Promise<{ learner?: string }>;
}) {
  const user = await requireUser();
  const { learner } = await searchParams;
  const supabase = await createClient();
  const learnerId = learner;
  if (!learnerId) {
    const { data } = await supabase
      .from("learners")
      .select("id")
      .eq("parent_id", user.id)
      .order("created_at")
      .limit(1)
      .maybeSingle();
    if (!data) redirect("/parent/learners/new");
    redirect(`/learner/mission?learner=${data.id}`);
  }
  const { data: owned } = await supabase
    .from("learners")
    .select("id")
    .eq("id", learnerId)
    .eq("parent_id", user.id)
    .maybeSingle();
  if (!owned) redirect("/parent/dashboard");
  const mission = await getOrCreateDailyMission(supabase, learnerId);
  return <MissionPlayer initialMission={mission} />;
}

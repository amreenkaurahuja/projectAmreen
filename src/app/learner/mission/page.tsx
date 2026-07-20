import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MissionPlayer } from "@/components/missions/mission-player";
import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { SupabaseMissionRepository } from "@/modules/missions/mission.repository";
import { MissionService } from "@/modules/missions/mission.service";
import { SupabaseMissionPlayerRepository } from "@/modules/missions/mission-player.repository";
import { MissionPlayerService } from "@/modules/missions/mission-player.service";
import { getInitialMissionIndex } from "@/modules/missions/resume";

const learnerIdSchema = z.string().uuid();

// This route renders per-learner, per-attempt state (which mission item is
// next). It must never be served from a cached RSC payload — every request
// has to recompute the resume position from persisted attempts.
export const dynamic = "force-dynamic";

export default async function MissionPage({
  searchParams,
}: {
  searchParams: Promise<{ learner?: string; mission?: string }>;
}) {
  const user = await requireUser();
  const { learner, mission: missionIdParam } = await searchParams;
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

  // A malformed learner id (e.g. a hand-edited URL) must not reach the
  // mission service below: Postgrest rejects invalid UUID syntax with an
  // error, and ensureLearnerOwned throws on that error rather than
  // returning a graceful "not owned" result.
  if (!learnerIdSchema.safeParse(learnerId).success) {
    redirect("/parent/dashboard");
  }

  const { data: owned } = await supabase
    .from("learners")
    .select("id")
    .eq("id", learnerId)
    .eq("parent_id", user.id)
    .maybeSingle();
  if (!owned) redirect("/parent/dashboard");

  const missionRepository = new SupabaseMissionRepository(
    supabase as SupabaseClient,
  );
  const missionService = new MissionService(missionRepository);
  const missionSummary =
    await missionService.getOrCreateTodaysMission(learnerId);

  if (!missionIdParam || missionIdParam !== missionSummary.missionId) {
    redirect(
      `/learner/mission?learner=${learnerId}&mission=${missionSummary.missionId}`,
    );
  }

  const playerRepository = new SupabaseMissionPlayerRepository(
    supabase as SupabaseClient,
  );
  const playerService = new MissionPlayerService(playerRepository);
  const mission = await playerService.getMissionForPlayer(
    learnerId,
    missionSummary.missionId,
  );

  // Computed here, from the attempts just loaded from the database, and
  // passed to the client as an explicit value — the client must not
  // recompute or default this to 0.
  const initialIndex = getInitialMissionIndex(mission);

  return (
    <>
      <pre
        style={{
          fontSize: 11,
          background: "#111",
          color: "#0f0",
          padding: 12,
          overflowX: "auto",
          margin: 0,
        }}
      >
        {JSON.stringify(
          {
            missionId: mission.missionId,
            answeredCount: mission.answeredCount,
            initialIndex,
            item1: {
              missionItemId: mission.questions[0]?.missionItemId,
              position: mission.questions[0]?.position,
              attempt: mission.questions[0]?.attempt,
            },
            item2: {
              missionItemId: mission.questions[1]?.missionItemId,
              position: mission.questions[1]?.position,
              attempt: mission.questions[1]?.attempt,
            },
          },
          null,
          2,
        )}
      </pre>
      <MissionPlayer initialMission={mission} initialIndex={initialIndex} />
    </>
  );
}

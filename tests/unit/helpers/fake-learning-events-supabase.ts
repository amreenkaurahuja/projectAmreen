// Stage 6.5 behavioural-verification helper: a minimal in-memory stand-in
// for the `learning_events` table, shared by the write path
// (SupabaseLearningEventRepository) and the read path
// (SupabaseQuestionExplainerMetricsRepository) so a single test can prove
// "what got persisted is what gets reported" end-to-end, without a real
// Postgres instance. Deliberately reproduces only the two behaviours that
// matter for these tests: the event_id unique-constraint conflict (23505)
// and learner_id/occurred_at filtering — not the full schema/CHECK
// constraint (already verified at the unit level in
// tests/unit/learning-event-repository.test.ts and
// tests/unit/question-explainer-metrics-repository.test.ts).

export interface FakeLearningEventRow {
  event_id: string;
  learner_id: string;
  attempt_id: string;
  session_id: string;
  event_type: string;
  step: string | null;
  last_step: string | null;
  exit_method: string | null;
  duration_ms: number | null;
  occurred_at: string;
  created_at: string;
}

export function createFakeLearningEventsTable() {
  const rows: FakeLearningEventRow[] = [];

  return {
    rows,
    insert(payload: Record<string, unknown>): {
      error: { code: string; message: string } | null;
    } {
      const eventId = payload.event_id as string;
      if (rows.some((row) => row.event_id === eventId)) {
        return {
          error: {
            code: "23505",
            message: "duplicate key value violates unique constraint",
          },
        };
      }
      rows.push({
        event_id: eventId,
        learner_id: payload.learner_id as string,
        attempt_id: payload.attempt_id as string,
        session_id: payload.session_id as string,
        event_type: payload.event_type as string,
        step: (payload.step as string | null) ?? null,
        last_step: (payload.last_step as string | null) ?? null,
        exit_method: (payload.exit_method as string | null) ?? null,
        duration_ms: (payload.duration_ms as number | null) ?? null,
        occurred_at: payload.occurred_at as string,
        // A real created_at is DB-generated on insert (0012's schema); an
        // incrementing counter stands in for "later inserts sort after
        // earlier ones" without depending on real wall-clock resolution.
        created_at: String(rows.length).padStart(6, "0"),
      });
      return { error: null };
    },
    select(
      learnerId: string,
      from?: string,
      to?: string,
    ): FakeLearningEventRow[] {
      let result = rows.filter((row) => row.learner_id === learnerId);
      if (from) result = result.filter((row) => row.occurred_at >= from);
      if (to) result = result.filter((row) => row.occurred_at < to);
      return [...result].sort((a, b) => {
        if (a.occurred_at !== b.occurred_at) {
          return a.occurred_at < b.occurred_at ? -1 : 1;
        }
        return a.created_at < b.created_at ? -1 : 1;
      });
    },
  };
}

type FakeTable = ReturnType<typeof createFakeLearningEventsTable>;

/** Shaped like enough of a SupabaseClient for SupabaseLearningEventRepository and SupabaseQuestionExplainerMetricsRepository to operate against unmodified — cast with `as never` at each call site, matching this codebase's existing mocked-Supabase test convention. */
export function createFakeSupabaseClient(
  table: FakeTable,
  authUserId = "parent-1",
) {
  function makeSelectBuilder() {
    let learnerId = "";
    let from: string | undefined;
    let to: string | undefined;

    const builder = {
      eq: (_column: string, value: string) => {
        learnerId = value;
        return builder;
      },
      order: () => builder,
      gte: (_column: string, value: string) => {
        from = value;
        return builder;
      },
      lt: (_column: string, value: string) => {
        to = value;
        return builder;
      },
      then: (
        onFulfilled: (value: {
          data: FakeLearningEventRow[];
          error: null;
        }) => unknown,
      ) =>
        Promise.resolve({
          data: table.select(learnerId, from, to),
          error: null,
        }).then(onFulfilled),
    };
    return builder;
  }

  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: authUserId } },
        error: null,
      }),
    },
    from: (tableName: string) => {
      if (tableName !== "learning_events") {
        throw new Error(`Unexpected table: ${tableName}`);
      }
      return {
        insert: async (payload: Record<string, unknown>) =>
          table.insert(payload),
        select: () => makeSelectBuilder(),
      };
    },
  };
}

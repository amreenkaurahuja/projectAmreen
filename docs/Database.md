# Database

Postgres via Supabase. Schema lives entirely in `supabase/migrations/*.sql`, applied in order — that directory is the source of truth; this document is a readable summary of it as of migration `0004_phase3a_daily_missions.sql`.

Every table has Row Level Security **enabled**, and every policy is scoped through `auth.uid()` back to the owning parent. There is no table a signed-in user can read or write without an ownership chain back to their own `auth.uid()`, except the shared read-only curriculum catalogue (`subjects`, `topics`, `skills`, `learning_objectives`, `question_bank`, `question_options`), which any authenticated user can read.

## Entity overview

```
auth.users (Supabase-managed)
  └─ learners (parent_id)
       ├─ learner_subject_progress (learner_id, subject_id)
       └─ missions (learner_id)
            └─ mission_items (mission_id, question_id)
                 └─ question_attempts (mission_item_id, question_id, selected_option_id)

subjects
  └─ topics (subject_id)
       └─ skills (topic_id)
            └─ learning_objectives (skill_id)

question_bank (subject_id, topic_id?, skill_id?)
  └─ question_options (question_id)
```

## Tables

### `system_health` (0001)

Single-row connectivity check.

| column       | type          | notes                               |
| ------------ | ------------- | ----------------------------------- |
| `id`         | `smallint` PK | fixed at `1`                        |
| `status`     | `text`        | `ok` \| `degraded` \| `maintenance` |
| `updated_at` | `timestamptz` |                                     |

RLS: any authenticated user may `select`.

### `learners` (0002)

A child profile, owned by the parent account that created it.

| column                      | type                      | notes                |
| --------------------------- | ------------------------- | -------------------- |
| `id`                        | `uuid` PK                 |                      |
| `parent_id`                 | `uuid` → `auth.users(id)` | `on delete restrict` |
| `display_name`              | `text`                    | 1–80 chars           |
| `school_year`               | `smallint`                | 1–13                 |
| `exam_target`               | `text`                    | optional, ≤120 chars |
| `accessibility_preferences` | `jsonb`                   | default `{}`         |
| `created_at` / `updated_at` | `timestamptz`             |                      |

Index: `learners_parent_id_idx` on `(parent_id)`.
RLS: separate `select`/`insert`/`update`/`delete` policies, each `auth.uid() = parent_id`.

### `subjects`, `topics`, `skills`, `learning_objectives` (0003)

The shared curriculum catalogue — read-only from the app's perspective, seeded by the migration itself (idempotent `on conflict do update`).

- `subjects`: `slug` (unique, `^[a-z0-9-]+$`), `name`, `description`, `icon`, `sort_order`, `is_active`
- `topics`: belongs to a `subject_id`; `slug` unique per subject; `school_year_min`/`school_year_max` (checked `min <= max`)
- `skills`: belongs to a `topic_id`; `code` globally unique; `difficulty` 1–5
- `learning_objectives`: belongs to a `skill_id`; `statement`, `success_criteria`

Indexes on each child table's foreign key (`topics_subject_id_idx`, `skills_topic_id_idx`, `objectives_skill_id_idx`).
RLS: any authenticated user may `select` where `is_active = true`.

Seeded content: 4 subjects (Mathematics, English, Verbal Reasoning, Non-Verbal Reasoning), 16 topics (4 per subject), 16 skills (1 per topic, code pattern `SUBJ-AREA-NN`), and a generated learning objective per skill.

### `learner_subject_progress` (0003)

Per-learner, per-subject progress rollup.

| column                               | type          | notes                         |
| ------------------------------------ | ------------- | ----------------------------- |
| `learner_id`, `subject_id`           | `uuid`        | composite PK                  |
| `progress_percent`                   | `smallint`    | 0–100                         |
| `skills_started` / `skills_mastered` | `integer`     | checked `mastered <= started` |
| `last_activity_at`                   | `timestamptz` | nullable                      |

Index: `learner_subject_progress_learner_idx` on `(learner_id)`.
RLS: `select`/`insert`/`update` policies via `exists (select 1 from learners where learners.id = learner_id and learners.parent_id = auth.uid())`.

### `question_bank`, `question_options` (0004)

The pool of exam-style questions missions are generated from.

- `question_bank`: `subject_id` (required), `topic_id`/`skill_id` (optional), `prompt` (3–1000 chars, unique), `explanation` (≤1500 chars), `difficulty` 1–5, `is_active`
- `question_options`: belongs to `question_id`; `label`, `is_correct`, `sort_order`; unique `(question_id, sort_order)`

Index: `question_bank_subject_idx` on `(subject_id) where is_active`.
RLS: any authenticated user may read active questions / options for active questions. Seeded separately via `npm run seed:questions` (`scripts/seedQuestions.ts`), not by a migration.

### `missions` (0004)

One daily mission per learner per day.

| column                      | type                    | notes                                   |
| --------------------------- | ----------------------- | --------------------------------------- |
| `id`                        | `uuid` PK               |                                         |
| `learner_id`                | `uuid` → `learners(id)` | `on delete cascade`                     |
| `mission_date`              | `date`                  | default `current_date`                  |
| `status`                    | `text`                  | `ready` \| `in_progress` \| `completed` |
| `estimated_minutes`         | `smallint`              | 1–180, default 20                       |
| `completed_at`              | `timestamptz`           | nullable                                |
| `created_at` / `updated_at` | `timestamptz`           |                                         |

Unique: `(learner_id, mission_date)` — this is what makes "get or create today's mission" safe under concurrent requests: the second `insert` hits the unique constraint (`23505`) and the app re-reads the winning row instead of erroring.
Index: `missions_learner_date_idx` on `(learner_id, mission_date desc)`.
RLS: single `for all` policy, `exists (learners where learners.id = learner_id and parent_id = auth.uid())`, both `using` and `with check`.

### `mission_items` (0004)

The 16 questions assigned to a specific mission, in order.

| column        | type                         | notes                |
| ------------- | ---------------------------- | -------------------- |
| `id`          | `uuid` PK                    |                      |
| `mission_id`  | `uuid` → `missions(id)`      | `on delete cascade`  |
| `question_id` | `uuid` → `question_bank(id)` | `on delete restrict` |
| `position`    | `smallint`                   | `> 0`                |
| `created_at`  | `timestamptz`                |                      |

Unique: `(mission_id, position)` and `(mission_id, question_id)` — no duplicate position, no repeated question in a mission.
Index: `mission_items_mission_idx` on `(mission_id, position)`.
RLS: single `for all` policy via `missions → learners → parent_id = auth.uid()`.

### `question_attempts` (0004)

A learner's answer to one mission item.

| column               | type                                     | notes                                                             |
| -------------------- | ---------------------------------------- | ----------------------------------------------------------------- |
| `id`                 | `uuid` PK                                |                                                                   |
| `mission_item_id`    | `uuid` → `mission_items(id)`, **unique** | `on delete cascade`                                               |
| `question_id`        | `uuid` → `question_bank(id)`             | `on delete restrict`                                              |
| `selected_option_id` | `uuid` → `question_options(id)`          | `on delete restrict`                                              |
| `is_correct`         | `boolean`                                | computed server-side at write time, never trusted from the client |
| `response_ms`        | `integer`                                | 0–3,600,000, default 0                                            |
| `answered_at`        | `timestamptz`                            | default `now()`                                                   |

The `unique` constraint on `mission_item_id` is what guarantees **one attempt per mission item** — re-answering a question is an `upsert` on `onConflict: "mission_item_id"` (see `SupabaseMissionPlayerRepository.upsertAttempt`), never a second row.
RLS: single `for all` policy via `mission_items → missions → learners → parent_id = auth.uid()`.

> See `docs/Architecture.md` → "A schema/RLS interaction to know about" for a real bug this table's RLS policy caused when queried via a PostgREST to-many embed, and why the repository queries it as a standalone `select` instead.

## Migrations

| file                              | adds                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------- |
| `0001_phase0_health.sql`          | `system_health`                                                                               |
| `0002_phase1_identity.sql`        | `learners`                                                                                    |
| `0003_phase2_curriculum.sql`      | `subjects`, `topics`, `skills`, `learning_objectives`, `learner_subject_progress` + seed data |
| `0004_phase3a_daily_missions.sql` | `question_bank`, `question_options`, `missions`, `mission_items`, `question_attempts`         |

Migrations are written to be **idempotent** (`create table if not exists`, `create index if not exists`, `drop policy if exists` before `create policy`, seed inserts use `on conflict do update`) so they're safe to re-run. Apply new migrations through the Supabase CLI / dashboard SQL editor in numeric order.

As of Phase 4 (mission completion, review, summary), **no new migration was needed** — `missions.status` already supported `'completed'`, `missions.completed_at` already existed, `question_attempts.mission_item_id` was already unique, and the indexes needed for the review query already existed from `0004`.

## Seed data

- Curriculum catalogue (subjects/topics/skills/objectives): part of `0003_phase2_curriculum.sql` itself.
- Question bank content: `npm run seed:questions` → `scripts/seedQuestions.ts`, authenticated with `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS to bulk-insert). This is the **only** place in the whole codebase that uses the service-role key — the running Next.js app never does. See `docs/ENVIRONMENTS.md`.

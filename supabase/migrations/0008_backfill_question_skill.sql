-- Phase 5.1 follow-up: question_bank.skill_id was nullable and, in
-- practice, never set by the seed script — the app inferred a skill from
-- the question's topic instead (see migration 0007's header comment and
-- SupabaseMasteryRepository.getQuestionCurriculumMetadata). That inference
-- only works while every topic has exactly one active skill, which happens
-- to be true of the seeded curriculum today but is not an invariant the
-- schema enforced — the moment a topic gains a second skill (e.g. "Adding",
-- "Subtracting", "Mixed Numbers" all under a single "Fractions" topic),
-- every question in that topic would silently stop resolving to a skill at
-- all, and mastery would quietly stop being tracked for it.
--
-- This migration makes skill_id mandatory going forward: it backfills every
-- existing row from its topic's skill (safe today because it's still a 1:1
-- mapping), then adds a NOT NULL constraint so a future question can never
-- be inserted without one. scripts/seedQuestions.ts and data/questions.json
-- were updated alongside this migration to always supply skill_id.
--
-- If a question somehow has no topic_id (topic_id is nullable) or its
-- topic has zero or more than one active skill, the backfill below cannot
-- resolve it and the subsequent `not null` will fail loudly — on purpose,
-- so any such row has to be fixed by hand rather than silently left
-- unresolvable.
-- Only backfills a topic whose active-skill count is exactly 1 — the same
-- condition the application-level fallback required. A topic with zero or
-- multiple active skills is left null on purpose, so it surfaces as a hard
-- failure on the `not null` below instead of an arbitrary, wrong guess.
-- array_agg(...)[1] rather than min(id): plain Postgres has no min/max
-- aggregate for uuid. The choice of *which* row only matters when
-- skill_count = 1 (the only case actually used below), so any deterministic
-- pick is fine.
update public.question_bank
set skill_id = matched.skill_id
from (
  select topic_id, (array_agg(id))[1] as skill_id, count(*) as skill_count
  from public.skills
  where is_active = true
  group by topic_id
) matched
where question_bank.skill_id is null
  and question_bank.topic_id = matched.topic_id
  and matched.skill_count = 1;

alter table public.question_bank
  alter column skill_id set not null;

-- Phase 5.2: adaptive mission generation.
--
-- Adds explainability metadata for how each question in a mission was
-- chosen, and a light summary of the generation run itself. Deliberately
-- minimal: no prompts, no answer keys, no child-identifying data — see
-- docs/Architecture.md → "Adaptive mission generation" for what each field
-- is used for and why nothing more sensitive is stored here.

alter table public.mission_items
  add column if not exists selection_reason text
    check (selection_reason in (
      'weak_skill', 'review_due', 'curriculum_coverage', 'challenge', 'fallback'
    ));

alter table public.missions
  add column if not exists generation_strategy text,
  add column if not exists generation_metadata jsonb not null default '{}'::jsonb;

-- Phase 2: curriculum foundation for Project Amreen.
-- The catalogue is shared read-only content. Learner progress remains parent-owned.

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 2 and 80),
  description text not null default '' check (char_length(description) <= 500),
  icon text not null default '📘' check (char_length(icon) <= 16),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 2 and 120),
  description text not null default '' check (char_length(description) <= 500),
  school_year_min smallint not null default 3 check (school_year_min between 1 and 13),
  school_year_max smallint not null default 6 check (school_year_max between 1 and 13),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_id, slug),
  check (school_year_min <= school_year_max)
);

create table if not exists public.skills (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  code text not null unique check (char_length(code) between 3 and 60),
  name text not null check (char_length(name) between 2 and 160),
  description text not null default '' check (char_length(description) <= 700),
  difficulty smallint not null default 1 check (difficulty between 1 and 5),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.learning_objectives (
  id uuid primary key default gen_random_uuid(),
  skill_id uuid not null references public.skills(id) on delete cascade,
  statement text not null check (char_length(statement) between 5 and 300),
  success_criteria text not null default '' check (char_length(success_criteria) <= 500),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.learner_subject_progress (
  learner_id uuid not null references public.learners(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  progress_percent smallint not null default 0 check (progress_percent between 0 and 100),
  skills_started integer not null default 0 check (skills_started >= 0),
  skills_mastered integer not null default 0 check (skills_mastered >= 0),
  last_activity_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (learner_id, subject_id),
  check (skills_mastered <= skills_started)
);

create index if not exists topics_subject_id_idx on public.topics(subject_id);
create index if not exists skills_topic_id_idx on public.skills(topic_id);
create index if not exists objectives_skill_id_idx on public.learning_objectives(skill_id);
create index if not exists learner_subject_progress_learner_idx on public.learner_subject_progress(learner_id);

alter table public.subjects enable row level security;
alter table public.topics enable row level security;
alter table public.skills enable row level security;
alter table public.learning_objectives enable row level security;
alter table public.learner_subject_progress enable row level security;

drop policy if exists "Authenticated users can read active subjects" on public.subjects;
create policy "Authenticated users can read active subjects"
on public.subjects for select to authenticated using (is_active = true);

drop policy if exists "Authenticated users can read active topics" on public.topics;
create policy "Authenticated users can read active topics"
on public.topics for select to authenticated using (is_active = true);

drop policy if exists "Authenticated users can read active skills" on public.skills;
create policy "Authenticated users can read active skills"
on public.skills for select to authenticated using (is_active = true);

drop policy if exists "Authenticated users can read active objectives" on public.learning_objectives;
create policy "Authenticated users can read active objectives"
on public.learning_objectives for select to authenticated using (is_active = true);

drop policy if exists "Parents can view own learner progress" on public.learner_subject_progress;
create policy "Parents can view own learner progress"
on public.learner_subject_progress for select to authenticated
using (
  exists (
    select 1 from public.learners
    where learners.id = learner_subject_progress.learner_id
      and learners.parent_id = auth.uid()
  )
);

drop policy if exists "Parents can create own learner progress" on public.learner_subject_progress;
create policy "Parents can create own learner progress"
on public.learner_subject_progress for insert to authenticated
with check (
  exists (
    select 1 from public.learners
    where learners.id = learner_subject_progress.learner_id
      and learners.parent_id = auth.uid()
  )
);

drop policy if exists "Parents can update own learner progress" on public.learner_subject_progress;
create policy "Parents can update own learner progress"
on public.learner_subject_progress for update to authenticated
using (
  exists (
    select 1 from public.learners
    where learners.id = learner_subject_progress.learner_id
      and learners.parent_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.learners
    where learners.id = learner_subject_progress.learner_id
      and learners.parent_id = auth.uid()
  )
);

-- Re-runnable seed data for the initial 11+ curriculum catalogue.
insert into public.subjects (slug, name, description, icon, sort_order)
values
  ('mathematics', 'Mathematics', 'Number, arithmetic, geometry, measures and problem solving.', '➗', 10),
  ('english', 'English', 'Reading comprehension, vocabulary, grammar and writing.', '📚', 20),
  ('verbal-reasoning', 'Verbal Reasoning', 'Word relationships, codes, logic and language patterns.', '🔤', 30),
  ('non-verbal-reasoning', 'Non-Verbal Reasoning', 'Shape patterns, spatial reasoning and visual logic.', '🔷', 40)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

with topic_seed(subject_slug, slug, name, description, sort_order) as (
  values
    ('mathematics', 'number-and-place-value', 'Number & Place Value', 'Read, compare and reason with whole numbers and decimals.', 10),
    ('mathematics', 'arithmetic', 'Arithmetic', 'Build fluency in the four operations, fractions, decimals and percentages.', 20),
    ('mathematics', 'problem-solving', 'Problem Solving', 'Choose operations, interpret information and explain multi-step solutions.', 30),
    ('mathematics', 'geometry-and-measures', 'Geometry & Measures', 'Work with properties of shapes, angles, area, perimeter and units.', 40),
    ('english', 'reading-comprehension', 'Reading Comprehension', 'Retrieve, infer, summarise and explain evidence from a text.', 10),
    ('english', 'vocabulary', 'Vocabulary', 'Develop precise word knowledge, synonyms, antonyms and meaning in context.', 20),
    ('english', 'grammar-and-punctuation', 'Grammar & Punctuation', 'Apply sentence structure, word classes and accurate punctuation.', 30),
    ('english', 'creative-writing', 'Creative Writing', 'Plan and craft engaging, controlled and imaginative writing.', 40),
    ('verbal-reasoning', 'word-relationships', 'Word Relationships', 'Recognise synonyms, antonyms, analogies and classifications.', 10),
    ('verbal-reasoning', 'letter-and-number-codes', 'Letter & Number Codes', 'Decode and apply systematic letter and number rules.', 20),
    ('verbal-reasoning', 'word-building', 'Word Building', 'Form words through letter movement, insertion and compound patterns.', 30),
    ('verbal-reasoning', 'verbal-logic', 'Verbal Logic', 'Use written clues to reach valid conclusions.', 40),
    ('non-verbal-reasoning', 'shape-sequences', 'Shape Sequences', 'Identify changes and predict the next figure in a sequence.', 10),
    ('non-verbal-reasoning', 'analogies', 'Visual Analogies', 'Apply the same visual transformation to a new pair of shapes.', 20),
    ('non-verbal-reasoning', 'matrices', 'Matrices', 'Find rules operating across rows and columns.', 30),
    ('non-verbal-reasoning', 'spatial-reasoning', 'Spatial Reasoning', 'Rotate, reflect, fold and mentally manipulate shapes.', 40)
)
insert into public.topics (subject_id, slug, name, description, sort_order)
select s.id, t.slug, t.name, t.description, t.sort_order
from topic_seed t
join public.subjects s on s.slug = t.subject_slug
on conflict (subject_id, slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

with skill_seed(topic_slug, code, name, description, difficulty, sort_order) as (
  values
    ('number-and-place-value', 'MATH-NPV-01', 'Compare and order numbers', 'Compare and order whole numbers and decimals using place value.', 1, 10),
    ('arithmetic', 'MATH-ARI-01', 'Four-operation fluency', 'Calculate accurately using addition, subtraction, multiplication and division.', 2, 10),
    ('problem-solving', 'MATH-PS-01', 'Solve multi-step word problems', 'Identify required operations and solve problems in logical stages.', 3, 10),
    ('geometry-and-measures', 'MATH-GM-01', 'Reason with shape and measure', 'Use properties, units and formulae to solve geometry and measure problems.', 2, 10),
    ('reading-comprehension', 'ENG-RC-01', 'Retrieve and infer', 'Find explicit information and support inferences with textual evidence.', 2, 10),
    ('vocabulary', 'ENG-VOC-01', 'Understand words in context', 'Use context and word relationships to determine precise meaning.', 2, 10),
    ('grammar-and-punctuation', 'ENG-GP-01', 'Control sentences and punctuation', 'Apply grammar and punctuation accurately for clarity and effect.', 2, 10),
    ('creative-writing', 'ENG-CW-01', 'Plan and craft a narrative', 'Structure an engaging narrative with controlled language and detail.', 3, 10),
    ('word-relationships', 'VR-WR-01', 'Recognise word relationships', 'Classify and connect words by meaning and function.', 2, 10),
    ('letter-and-number-codes', 'VR-CODE-01', 'Decode systematic rules', 'Identify and apply consistent coding operations.', 3, 10),
    ('word-building', 'VR-WB-01', 'Manipulate letters to form words', 'Insert, remove and rearrange letters according to a rule.', 2, 10),
    ('verbal-logic', 'VR-LOG-01', 'Draw conclusions from clues', 'Combine written conditions to identify the only valid answer.', 3, 10),
    ('shape-sequences', 'NVR-SEQ-01', 'Continue visual sequences', 'Track changes in position, number, shading and orientation.', 2, 10),
    ('analogies', 'NVR-ANA-01', 'Apply visual transformations', 'Transfer a transformation rule from one shape pair to another.', 3, 10),
    ('matrices', 'NVR-MAT-01', 'Complete visual matrices', 'Combine row and column rules to identify a missing figure.', 3, 10),
    ('spatial-reasoning', 'NVR-SPA-01', 'Mentally transform shapes', 'Reason about rotations, reflections, nets and folded shapes.', 3, 10)
)
insert into public.skills (topic_id, code, name, description, difficulty, sort_order)
select t.id, s.code, s.name, s.description, s.difficulty, s.sort_order
from skill_seed s
join public.topics t on t.slug = s.topic_slug
on conflict (code) do update set
  topic_id = excluded.topic_id,
  name = excluded.name,
  description = excluded.description,
  difficulty = excluded.difficulty,
  sort_order = excluded.sort_order,
  is_active = true,
  updated_at = now();

insert into public.learning_objectives (skill_id, statement, success_criteria, sort_order)
select sk.id,
  'Demonstrate: ' || sk.name,
  'Complete a suitable set of questions accurately and explain the method or rule used.',
  10
from public.skills sk
where not exists (
  select 1 from public.learning_objectives lo
  where lo.skill_id = sk.id and lo.sort_order = 10
);

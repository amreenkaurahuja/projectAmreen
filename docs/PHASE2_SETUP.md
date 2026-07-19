# Phase 2 setup — Curriculum foundation

Phase 2 adds the shared 11+ curriculum catalogue and learner subject dashboards.

## 1. Keep your existing secrets

Do not replace `.env.local`. The Phase 2 package intentionally contains only `.env.example`.

## 2. Install and validate locally

```powershell
npm install
npm run validate
```

## 3. Apply the database migration

Open `supabase/migrations/0003_phase2_curriculum.sql`, copy all of its SQL, and run it in:

**Supabase Dashboard → SQL Editor → New query → Run**

The migration is re-runnable. It creates and seeds:

- `subjects`
- `topics`
- `skills`
- `learning_objectives`
- `learner_subject_progress`

It also enables Row Level Security. Signed-in parents can read active curriculum content, while progress rows are restricted to learners they own.

## 4. Verify the seed

Run this in Supabase SQL Editor:

```sql
select s.name, count(t.id) as topics
from public.subjects s
left join public.topics t on t.subject_id = s.id
where s.is_active = true
group by s.id, s.name, s.sort_order
order by s.sort_order;
```

Expected: Mathematics, English, Verbal Reasoning and Non-Verbal Reasoning, each with four topics.

## 5. Deploy

```powershell
git add .
git commit -m "Complete Phase 2 curriculum foundation"
git push
```

Vercel will deploy automatically.

## 6. Production acceptance check

1. Sign in as the parent.
2. Open the learner dashboard.
3. Confirm four subject cards appear.
4. Open every subject.
5. Confirm each subject displays four topics and its initial skills.
6. Confirm `/api/health` still returns `status: ok`.
7. While signed out, confirm protected learner URLs redirect to login or are inaccessible.

## Phase boundary

Phase 2 models the curriculum and displays it. Phase 3 will generate and assign personalised daily missions. Phase 4 will add question delivery, marking and explanations.

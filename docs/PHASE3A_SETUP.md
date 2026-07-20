# Phase 3A setup

1. Keep your existing `.env.local`.
2. In Supabase SQL Editor, run the full contents of `supabase/migrations/0004_phase3a_daily_missions.sql`.
3. Verify the bank with:
   ```sql
   select s.name, count(q.id) questions
   from public.subjects s left join public.question_bank q on q.subject_id=s.id
   group by s.id,s.name,s.sort_order order by s.sort_order;
   ```
4. Run `npm install` and `npm run validate`.
5. Commit and push. Vercel will deploy automatically.
6. Sign in and open `/learner/dashboard`; select **Start or resume mission**.

The migration is re-runnable. A learner receives at most one mission per UTC date. Answers are upserted by mission item, so refreshing or closing the browser preserves progress.

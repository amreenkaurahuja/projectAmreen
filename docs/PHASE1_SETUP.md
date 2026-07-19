# Phase 1 setup

1. Run `supabase/migrations/0002_phase1_identity.sql` in Supabase SQL Editor.
2. In Supabase Authentication > URL Configuration, set Site URL to your Vercel production URL.
3. Add redirect URLs for `http://localhost:3000/auth/callback` and `https://YOUR-VERCEL-DOMAIN/auth/callback`.
4. In Authentication > Providers > Email, keep email enabled. For quickest private testing, you may temporarily disable email confirmation; enable it again before inviting other users.
5. Commit and push the Phase 1 files, then redeploy Vercel.
6. Open `/signup`, create the parent account, then create Amreen's learner profile.

Security note: never place the Supabase service-role key in a `NEXT_PUBLIC_` variable.

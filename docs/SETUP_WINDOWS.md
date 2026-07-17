# Windows setup

## Requirements

- Node.js 22 LTS or newer
- Git
- VS Code
- A free Supabase account
- A free Vercel account

## Start locally

```powershell
Copy-Item .env.example .env.local
npm install
npx playwright install chromium
npm run dev
```

Open `http://localhost:3000`.

## Run checks

```powershell
npm run validate
npm run test:e2e
```

## Connect Supabase

1. Create a Supabase project.
2. Open Project Settings → API.
3. Copy the project URL and publishable key into `.env.local`.
4. Open the Supabase SQL Editor and run `supabase/migrations/0001_phase0_health.sql`.
5. Restart `npm run dev` after changing environment variables.

## Connect GitHub and Vercel

1. Create an empty GitHub repository.
2. Commit this folder and push to `main`.
3. Import the repository into Vercel.
4. Add the required environment variables in Vercel.
5. Deploy and open `/api/health` to confirm the application is operational.

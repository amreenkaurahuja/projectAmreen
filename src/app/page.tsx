export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col justify-center px-6 py-16">
      <p className="mb-3 text-sm font-medium tracking-wide text-violet-700 uppercase">
        Phase 0 foundation
      </p>
      <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
        Project Amreen
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-slate-600">
        The repository, environments, Supabase boundary, continuous integration,
        and automated testing foundation are ready for the learner platform.
      </p>
      <section className="mt-10 grid gap-4 sm:grid-cols-2">
        {[
          "Next.js and strict TypeScript",
          "Supabase SSR client boundary",
          "Vitest unit testing",
          "Playwright end-to-end testing",
          "GitHub Actions quality gate",
          "Environment and health checks",
        ].map((item) => (
          <div key={item} className="rounded-2xl border border-slate-200 p-4">
            <span aria-hidden="true">✓ </span>
            {item}
          </div>
        ))}
      </section>
    </main>
  );
}

import Link from "next/link";
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-4xl items-center px-6 py-16">
      <section>
        <p className="text-sm font-medium tracking-wide uppercase">
          Project Amreen
        </p>
        <h1 className="mt-3 max-w-2xl text-4xl font-semibold">
          A private, adaptive learning foundation built one reliable phase at a
          time.
        </h1>
        <p className="mt-5 max-w-xl text-neutral-600">
          Phase 1 provides secure parent authentication and learner profiles.
        </p>
        <div className="mt-8 flex gap-3">
          <Link
            href="/signup"
            className="rounded-xl bg-black px-5 py-3 text-white"
          >
            Create parent account
          </Link>
          <Link href="/login" className="rounded-xl border px-5 py-3">
            Sign in
          </Link>
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <section className="w-full rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">Parent sign in</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Access Amreen’s secure learning dashboard.
        </p>
        <div className="mt-6">
          <LoginForm />
        </div>
        <p className="mt-6 text-sm">
          New here?{" "}
          <Link className="underline" href="/signup">
            Create an account
          </Link>
        </p>
      </section>
    </main>
  );
}

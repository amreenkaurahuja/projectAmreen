import Link from "next/link";
import { SignupForm } from "@/components/auth/signup-form";

export default function SignupPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6 py-12">
      <section className="w-full rounded-2xl border p-6">
        <h1 className="text-2xl font-semibold">Create parent account</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Your child’s information remains private to your account.
        </p>
        <div className="mt-6">
          <SignupForm />
        </div>
        <p className="mt-6 text-sm">
          Already registered?{" "}
          <Link className="underline" href="/login">
            Sign in
          </Link>
        </p>
      </section>
    </main>
  );
}

"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    router.replace("/parent/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block text-sm">
        Email
        <input
          required
          name="email"
          type="email"
          autoComplete="email"
          className="mt-1 w-full rounded-xl border px-3 py-2"
        />
      </label>
      <label className="block text-sm">
        Password
        <input
          required
          name="password"
          type="password"
          autoComplete="current-password"
          minLength={8}
          className="mt-1 w-full rounded-xl border px-3 py-2"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <button
        disabled={loading}
        className="w-full rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}

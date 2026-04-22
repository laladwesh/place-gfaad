"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export function GitHubAuthButton() {
  const { data: session } = useSession();

  if (!session) {
    return (
      <button
        type="button"
        onClick={() => signIn("github")}
        className="rounded-xl bg-ink px-5 py-3 font-semibold text-white transition hover:opacity-90"
      >
        Continue with GitHub
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/" })}
      className="rounded-xl border border-ink/25 px-5 py-3 font-semibold text-ink transition hover:bg-ink/5"
    >
      Sign out
    </button>
  );
}

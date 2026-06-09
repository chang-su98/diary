"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      onClick={logout}
      className="text-xs tracking-[0.2em] text-text-muted underline-offset-4 transition-colors hover:text-primary hover:underline"
    >
      LOGOUT
    </button>
  );
}

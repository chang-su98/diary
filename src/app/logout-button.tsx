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
      className="rounded-lg bg-primary px-6 py-2.5 font-semibold text-white transition-colors active:bg-primary-strong"
    >
      로그아웃
    </button>
  );
}

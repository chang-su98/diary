"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();

  async function logout() {
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) {
        alert("로그아웃에 실패했습니다. 다시 시도해 주세요.");
        return;
      }
      router.replace("/login");
      router.refresh();
    } catch {
      alert("네트워크 오류로 로그아웃하지 못했습니다.");
    }
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

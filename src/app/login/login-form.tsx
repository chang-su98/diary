"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "로그인에 실패했습니다.");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-4">
      <input
        type="text"
        autoComplete="username"
        placeholder="아이디"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
        className="w-full rounded-full bg-surface px-5 py-3.5 shadow-sm outline-none focus:ring-2 focus:ring-primary/40"
      />
      <input
        type="password"
        autoComplete="current-password"
        placeholder="비밀번호"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        className="w-full rounded-full bg-surface px-5 py-3.5 shadow-sm outline-none focus:ring-2 focus:ring-primary/40"
      />
      {error && <p className="px-2 text-sm text-error">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="mt-2 w-full rounded-lg bg-primary py-3.5 font-semibold text-white transition-colors active:bg-primary-strong disabled:opacity-60"
      >
        {loading ? "로그인 중…" : "로그인"}
      </button>
    </form>
  );
}

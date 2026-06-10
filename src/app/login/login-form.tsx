"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const SAVED_ID_KEY = "savedUsername";

export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // localStorage는 클라이언트에서만 접근 가능 → 마운트 후 1회 동기화(하이드레이션 안전).
  useEffect(() => {
    const saved = localStorage.getItem(SAVED_ID_KEY);
    if (!saved) return;
    /* eslint-disable react-hooks/set-state-in-effect -- 외부(localStorage) 상태를 마운트 시 1회 반영 */
    setUsername(saved);
    setRemember(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

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
      if (remember) {
        localStorage.setItem(SAVED_ID_KEY, username);
      } else {
        localStorage.removeItem(SAVED_ID_KEY);
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
    <form onSubmit={onSubmit} className="flex w-full flex-col gap-7">
      <input
        type="text"
        autoComplete="username"
        placeholder="ID"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        required
        className="w-full border-b border-line bg-transparent px-1 py-3 tracking-wide outline-none transition-colors duration-200 placeholder:text-text-muted focus:border-primary"
      />
      <input
        type="password"
        autoComplete="current-password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        className="w-full border-b border-line bg-transparent px-1 py-3 tracking-wide outline-none transition-colors duration-200 placeholder:text-text-muted focus:border-primary"
      />

      <label className="group flex cursor-pointer select-none items-center gap-2.5 text-sm tracking-wide text-text-muted">
        <span className="relative inline-flex size-[18px] items-center justify-center rounded-md border border-line bg-surface transition-all duration-200 has-[:checked]:border-primary has-[:checked]:bg-primary">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="peer absolute inset-0 cursor-pointer opacity-0"
          />
          <svg
            viewBox="0 0 14 14"
            fill="none"
            width="14"
            height="14"
            className="pointer-events-none size-3.5 shrink-0 scale-50 text-white opacity-0 transition-all duration-200 peer-checked:scale-100 peer-checked:opacity-100"
          >
            <path
              d="M3 7.5L6 10.5L11 4"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span className="transition-colors duration-200 group-hover:text-primary">
          Save ID
        </span>
      </label>

      <button
        type="submit"
        disabled={loading}
        className="mt-1 w-full rounded-xl bg-primary py-4 text-sm tracking-[0.25em] text-white shadow-sm transition-all duration-200 hover:bg-primary-strong hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
      >
        {loading ? "LOGIN…" : "LOGIN"}
      </button>
      {error && (
        <p className="-mt-2 text-center text-sm text-error">{error}</p>
      )}
    </form>
  );
}

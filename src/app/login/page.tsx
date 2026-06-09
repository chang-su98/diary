import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인 · 기록",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-8 py-16">
      <div className="w-full max-w-xs animate-fade-up">
        <h1 className="mb-3 pl-[0.3em] text-center text-3xl font-light tracking-[0.3em]">
          Login
        </h1>
        <p className="mb-16 pl-[0.2em] text-center text-xs tracking-[0.2em] text-text-muted">
          함께 기록하다
        </p>
        <LoginForm />
      </div>
    </main>
  );
}

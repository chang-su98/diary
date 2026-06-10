import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인 · RECORD",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-8 py-16">
      <div className="w-full max-w-xs animate-fade-up">
        <h1 className="mb-3 pl-[0.3em] text-center text-3xl font-light tracking-[0.3em]">
          RECORD
        </h1>
        <p className="mb-10 text-center text-xs tracking-[0.15em] text-text-muted">
          our days, together
        </p>
        <LoginForm />
      </div>
    </main>
  );
}

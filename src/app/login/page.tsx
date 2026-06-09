import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "로그인 · 기록",
};

export default function LoginPage() {
  return (
    <main className="flex min-h-full flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm">
        <h1 className="mb-2 text-center text-3xl font-bold">기록</h1>
        <p className="mb-10 text-center text-text-muted">
          로그인하고 함께 기록해요
        </p>
        <LoginForm />
      </div>
    </main>
  );
}

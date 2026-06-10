"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fileToResizedDataURL } from "@/lib/image";

type Initial = {
  username: string;
  displayName: string | null;
  birthday: string | null; // ISO 문자열
  email: string | null;
  avatar: string | null;
};

export function ProfileForm({ initial }: { initial: Initial }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(initial.displayName ?? "");
  const [birthday, setBirthday] = useState(
    initial.birthday ? initial.birthday.slice(0, 10) : ""
  );
  const [email, setEmail] = useState(initial.email ?? "");
  const [avatar, setAvatar] = useState<string | null>(initial.avatar);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAvatar(await fileToResizedDataURL(file));
      setMsg(null);
    } catch {
      setMsg("이미지를 불러오지 못했습니다.");
    }
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: name,
          birthday: birthday || null,
          email,
          avatar,
        }),
      });
      if (!res.ok) {
        setMsg("저장에 실패했습니다.");
        return;
      }
      router.push("/profile");
      router.refresh();
    } catch {
      setMsg("네트워크 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-8 pb-28 pt-14">
      <h1 className="mb-10 pl-[0.3em] text-center text-2xl font-light tracking-[0.3em]">
        EDIT
      </h1>

      {/* 아바타 */}
      <div className="mb-10 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="size-24 overflow-hidden rounded-full border border-line bg-bg transition-opacity hover:opacity-80"
          aria-label="프로필 사진 변경"
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL 미리보기
            <img src={avatar} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center text-2xl font-light text-text-muted">
              {(name || initial.username).charAt(0).toUpperCase()}
            </span>
          )}
        </button>
        <span className="text-xs tracking-wide text-text-muted">사진 변경</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          onChange={onPickFile}
          className="hidden"
        />
      </div>

      <form onSubmit={onSave} className="flex flex-col gap-6">
        <Field label="ID">
          <input
            value={initial.username}
            readOnly
            className="w-full cursor-not-allowed border-b border-line bg-transparent py-2 text-text-muted"
          />
        </Field>
        <Field label="이름">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={50}
            placeholder="이름을 입력하세요"
            className="w-full border-b border-line bg-transparent py-2 outline-none transition-colors focus:border-primary placeholder:text-text-muted"
          />
        </Field>
        <Field label="생일">
          <input
            type="date"
            value={birthday}
            onChange={(e) => setBirthday(e.target.value)}
            className="w-full border-b border-line bg-transparent py-2 outline-none transition-colors focus:border-primary"
          />
        </Field>
        <Field label="이메일">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={255}
            placeholder="이메일을 입력하세요"
            className="w-full border-b border-line bg-transparent py-2 outline-none transition-colors focus:border-primary placeholder:text-text-muted"
          />
        </Field>

        <button
          type="submit"
          disabled={saving}
          className="mt-4 w-full rounded-xl bg-primary py-4 text-sm tracking-[0.25em] text-white transition-all duration-200 hover:bg-primary-strong active:scale-[0.98] disabled:opacity-50"
        >
          {saving ? "저장 중…" : "SAVE"}
        </button>
        {msg && <p className="text-center text-sm text-text-muted">{msg}</p>}
      </form>

      <div className="mt-8 flex justify-center">
        <Link
          href="/profile"
          className="text-xs tracking-[0.2em] text-text-muted underline-offset-4 transition-colors hover:text-primary hover:underline"
        >
          CANCEL
        </Link>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs tracking-[0.15em] text-text-muted">{label}</span>
      {children}
    </label>
  );
}

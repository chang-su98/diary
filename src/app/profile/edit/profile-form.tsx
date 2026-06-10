"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Drawer } from "vaul";
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
  const [sheetOpen, setSheetOpen] = useState(false);

  function chooseFile() {
    fileRef.current?.click();
    setSheetOpen(false);
  }

  function removeAvatarFromSheet() {
    setSheetOpen(false);
    onRemoveAvatar();
  }

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setAvatar(await fileToResizedDataURL(file));
      setMsg(null);
    } catch {
      setMsg("이미지를 불러오지 못했습니다.");
    } finally {
      // 같은 파일을 (삭제 후) 다시 선택할 수 있도록 입력값 초기화
      e.target.value = "";
    }
  }

  function onRemoveAvatar() {
    setAvatar(null);
    setMsg(null);
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
          displayName: name || null,
          birthday: birthday || null,
          email: email || null,
          avatar,
        }),
      });
      if (!res.ok) {
        // 서버가 준 검증 메시지(400 등)를 우선 노출, 없으면 일반 메시지
        const body: unknown = await res.json().catch(() => null);
        const serverMsg =
          body !== null &&
          typeof body === "object" &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "저장에 실패했습니다.";
        setMsg(serverMsg);
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
      <div className="mb-10 flex justify-center">
        <div className="relative size-24">
          {/* 아바타(이미지)를 눌러도 메뉴 표시 */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="프로필 사진 메뉴 열기"
            className="size-full overflow-hidden rounded-full border border-line bg-bg transition-opacity hover:opacity-80"
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

          {/* 사진 변경 배지 — 아바타 버튼과 동일 동작이라 장식 처리(중복 a11y 제거) */}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-hidden
            tabIndex={-1}
            className="absolute bottom-0 right-0 flex size-7 items-center justify-center rounded-full bg-text-muted text-white ring-2 ring-bg shadow-sm transition-colors hover:bg-text"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
              width={14}
              height={14}
              className="size-3.5 shrink-0"
            >
              <path
                d="M12 5V19M5 12H19"
                stroke="currentColor"
                strokeWidth={2.2}
                strokeLinecap="round"
              />
            </svg>
          </button>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={onPickFile}
            className="hidden"
          />
        </div>
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
          {/* 브라우저별 date UI 편차(iOS Safari 아이콘·placeholder 미표시) 대응:
              커스텀 캘린더 아이콘 + 빈값 placeholder 오버레이, 네이티브 표시기는 숨김 */}
          <div className="relative w-full">
            <input
              type="date"
              value={birthday}
              onChange={(e) => setBirthday(e.target.value)}
              onClick={(e) => {
                // showPicker 미지원/제스처 예외 시 네이티브 기본 동작에 위임
                try {
                  e.currentTarget.showPicker?.();
                } catch (err) {
                  console.debug("[birthday] showPicker 예외:", err);
                }
              }}
              className={`block w-full min-w-0 appearance-none border-b border-line bg-transparent py-2 pr-7 outline-none transition-colors [color-scheme:light] focus:border-primary [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-date-and-time-value]:text-left ${
                birthday ? "" : "text-transparent"
              }`}
            />
            {!birthday && (
              <span className="pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 text-text-muted">
                YYYY / MM / DD
              </span>
            )}
            <svg
              aria-hidden
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              className="pointer-events-none absolute right-0 top-1/2 size-[18px] -translate-y-1/2 text-text-muted"
            >
              <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M3 9.5H21M8 3V6M16 3V6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </div>
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
        {msg && (
          <p className="text-center text-sm text-error" role="alert">
            {msg}
          </p>
        )}
      </form>

      <div className="mt-8 flex justify-center">
        <Link
          href="/profile"
          className="text-xs tracking-[0.2em] text-text-muted underline-offset-4 transition-colors hover:text-primary hover:underline"
        >
          CANCEL
        </Link>
      </div>

      {/* 저장 중 딤 + 스피너 오버레이 */}
      {saving && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          role="status"
          aria-live="polite"
          aria-label="저장 중"
        >
          <span className="size-10 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
        </div>
      )}

      {/* 사진 메뉴 — vaul Drawer 바텀시트 */}
      <Drawer.Root open={sheetOpen} onOpenChange={setSheetOpen}>
        <Drawer.Portal>
          <Drawer.Overlay
            className="fixed inset-0 z-[60]"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          />
          <Drawer.Content className="fixed inset-x-0 bottom-0 z-[60] mx-auto flex w-full max-w-md flex-col rounded-t-3xl border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] outline-none">
            <div className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-line" />
            <Drawer.Title className="px-6 pb-1 pt-4 text-xs tracking-[0.15em] text-text-muted">
              프로필 사진
            </Drawer.Title>
            <Drawer.Description className="sr-only">
              프로필 사진을 변경하거나 삭제합니다.
            </Drawer.Description>

            <div className="flex flex-col px-3 pb-3">
              <button
                type="button"
                onClick={chooseFile}
                className="flex items-center gap-3 rounded-xl px-3 py-4 text-left text-[0.95rem] text-text transition-colors hover:bg-bg active:bg-bg"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden
                  width="20"
                  height="20"
                  className="size-5 shrink-0 text-text-muted"
                >
                  <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.6" />
                  <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" />
                  <path d="M21 15L16 10L5 21" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                사진 선택
              </button>

              {avatar && (
                <button
                  type="button"
                  onClick={removeAvatarFromSheet}
                  className="flex items-center gap-3 rounded-xl px-3 py-4 text-left text-[0.95rem] text-error transition-colors hover:bg-bg active:bg-bg"
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden
                    width="20"
                    height="20"
                    className="size-5 shrink-0"
                  >
                    <path d="M4 7H20M10 11V17M14 11V17M5 7L6 20C6 20.5304 6.21071 21.0391 6.58579 21.4142C6.96086 21.7893 7.46957 22 8 22H16C16.5304 22 17.0391 21.7893 17.4142 21.4142C17.7893 21.0391 18 20.5304 18 20L19 7M9 7V4C9 3.44772 9.44772 3 10 3H14C14.5523 3 15 3.44772 15 4V7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  사진 삭제
                </button>
              )}
            </div>
          </Drawer.Content>
        </Drawer.Portal>
      </Drawer.Root>
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

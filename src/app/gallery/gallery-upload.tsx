"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fileToScaledImage } from "@/lib/image";

export function GalleryUpload() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // 같은 파일 재선택 허용
    if (files.length === 0) return;

    setBusy(true);
    setMsg(null);
    let uploaded = 0;
    try {
      // 큰 payload 병렬 전송을 피해 순차 업로드
      for (const file of files) {
        const { dataUrl, width, height } = await fileToScaledImage(file);
        const res = await fetch("/api/photos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: dataUrl, width, height }),
        });
        if (!res.ok) {
          const body: unknown = await res.json().catch(() => null);
          const serverMsg =
            body !== null &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
              ? body.error
              : "업로드에 실패했습니다.";
          throw new Error(serverMsg);
        }
        uploaded += 1;
      }
      router.refresh();
    } catch (error) {
      // 일부만 올라간 경우에도 화면 갱신
      if (uploaded > 0) router.refresh();
      setMsg(error instanceof Error ? error.message : "업로드에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        aria-label="사진 추가"
        className="absolute right-4 top-[calc(2rem+env(safe-area-inset-top))] flex size-9 items-center justify-center rounded-full bg-primary text-white transition-all duration-200 hover:bg-primary-strong active:scale-95 disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden width={18} height={18} className="size-[18px]">
          <path d="M12 5V19M5 12H19" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" />
        </svg>
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onPickFiles}
        className="hidden"
      />

      {msg && (
        <p className="mt-2 text-center text-sm text-error" role="alert">
          {msg}
        </p>
      )}

      {busy && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
          role="status"
          aria-live="polite"
          aria-label="업로드 중"
        >
          <span className="size-10 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
        </div>
      )}
    </>
  );
}

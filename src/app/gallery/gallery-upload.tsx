"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
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
        className="absolute right-6 top-[calc(2rem+env(safe-area-inset-top))] p-1 transition-opacity hover:opacity-60 disabled:opacity-40"
      >
        {/* plus.svg를 mask로 사용 → 테마색(bg-text)으로 채색 (profile 헤더와 동일 패턴) */}
        <span
          aria-hidden
          className="block size-6 bg-text"
          style={{
            maskImage: "url(/asset/images/contents/plus.svg)",
            WebkitMaskImage: "url(/asset/images/contents/plus.svg)",
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskPosition: "center",
            WebkitMaskPosition: "center",
            maskSize: "contain",
            WebkitMaskSize: "contain",
          }}
        />
      </button>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        onChange={onPickFiles}
        className="hidden"
      />

      {/* 오버레이는 body로 포털 — PageTransition의 transform 쌓임 맥락을 벗어나
          하단 탭바(z-40) 위까지 덮도록 한다 */}
      {msg &&
        createPortal(
          <p
            role="alert"
            className="fixed left-1/2 top-[calc(1rem+env(safe-area-inset-top))] z-[80] -translate-x-1/2 rounded-full bg-error px-4 py-2 text-sm text-white shadow-lg"
          >
            {msg}
          </p>,
          document.body
        )}

      {busy &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center"
            style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
            role="status"
            aria-live="polite"
            aria-label="업로드 중"
          >
            <span className="size-10 animate-spin rounded-full border-[3px] border-white/25 border-t-white" />
          </div>,
          document.body
        )}
    </>
  );
}

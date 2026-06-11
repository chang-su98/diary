"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fileToScaledImage } from "@/lib/image";
import { useGalleryStore } from "@/lib/gallery-store";
import type { GalleryPhoto } from "./types";

// 동시 업로드 수 — 너무 크면 메모리/대역폭 부담, 1이면 느림. 3이 균형.
const UPLOAD_CONCURRENCY = 3;

// 업로드 → 생성된 사진 id + 표시 크기 반환
async function uploadOne(
  file: File
): Promise<{ id: number; width: number; height: number }> {
  // 원본(1280px)만 생성 — 그리드도 원본을 lazy 로딩(별도 썸네일 없음)
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
  const body = (await res.json()) as { photo: { id: number } };
  return { id: body.photo.id, width, height };
}

export function GalleryUpload({
  currentUser,
}: {
  currentUser: GalleryPhoto["author"];
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const prependMany = useGalleryStore((s) => s.prependMany);

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // 같은 파일 재선택 허용
    if (files.length === 0) return;

    setBusy(true);
    setMsg(null);
    let firstError: string | null = null;
    let next = 0;
    const uploaded: GalleryPhoto[] = [];

    // 동시성 제한 워커 풀 — 큐에서 하나씩 꺼내 병렬 업로드. 성공분은 모아둔다.
    async function worker() {
      while (next < files.length) {
        const file = files[next++];
        try {
          const { id, width, height } = await uploadOne(file);
          uploaded.push({ id, width, height, author: currentUser });
        } catch (error) {
          if (!firstError) {
            firstError =
              error instanceof Error ? error.message : "업로드에 실패했습니다.";
          }
        }
      }
    }

    try {
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, () =>
          worker()
        )
      );
      // 전부 끝난 뒤 한 번에 추가(최신 id 먼저) → masonic이 높이를 한 번에 잡아 레이아웃 안정
      if (uploaded.length > 0) {
        uploaded.sort((a, b) => b.id - a.id);
        prependMany(uploaded);
      }
      if (firstError) setMsg(firstError);
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

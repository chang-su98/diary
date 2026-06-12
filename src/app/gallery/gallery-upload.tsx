"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { fileToScaledImage } from "@/lib/image";
import { useGalleryStore } from "@/lib/gallery-store";
import { useGallerySelectionStore } from "@/lib/gallery-selection-store";
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
  hasPhotos,
}: {
  currentUser: GalleryPhoto["author"];
  // 현재 서버에 사진이 있어 GalleryGrid가 마운트돼 있는지. 업로드 후 레이아웃 보정
  // 방식을 분기한다(있으면 로컬 리레이아웃, 빈 갤러리면 서버 재시드).
  hasPhotos: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // 업로드 진행도 — done/total(파일 단위). indeterminate 스피너 대신 프로그레스바 표시용.
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [msg, setMsg] = useState<string | null>(null);
  const prependMany = useGalleryStore((s) => s.prependMany);
  const selecting = useGallerySelectionStore((s) => s.selecting);
  const enterSelection = useGallerySelectionStore((s) => s.enter);
  const selectAll = useGallerySelectionStore((s) => s.selectAll);
  const deselectAll = useGallerySelectionStore((s) => s.deselectAll);
  // 보이는 사진이 모두 선택됐는지(파생 불리언) → 전체선택/선택 해제 토글
  const allSelected = useGallerySelectionStore(
    (s) => s.allIds.length > 0 && s.allIds.every((id) => s.selectedIds.has(id))
  );
  const [menuOpen, setMenuOpen] = useState(false);

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // 같은 파일 재선택 허용
    if (files.length === 0) return;

    setBusy(true);
    setProgress({ done: 0, total: files.length });
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
        } finally {
          // 성공·실패 무관하게 한 장 처리 완료 → 진행도 1 증가
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      }
    }

    try {
      await Promise.all(
        Array.from({ length: Math.min(UPLOAD_CONCURRENCY, files.length) }, () =>
          worker()
        )
      );
      // 전부 끝난 뒤 한 번에 추가(최신 id 먼저) → 그리드가 prepend 받아 기존 타일을
      // 새 위치로 부드럽게 밀어내고 새 타일을 채운다(레이아웃은 그리드가 직접 재계산).
      if (uploaded.length > 0) {
        uploaded.sort((a, b) => b.id - a.id);
        prependMany(uploaded);
      }
      if (firstError) setMsg(firstError);
    } finally {
      setBusy(false);
    }

    // 빈 갤러리였으면 그리드 자체가 없으니(서버 empty 분기) 서버 재시드로 띄운다.
    // 기존 그리드가 있으면 위 prependMany만으로 즉시 부드럽게 반영된다(서버 왕복 없음).
    if (uploaded.length > 0 && !hasPhotos) router.refresh();
  }

  // 0~100(%). total이 0이면 0으로 안전 처리.
  const pct =
    progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <>
      {selecting ? (
        <button
          type="button"
          onClick={allSelected ? deselectAll : selectAll}
          className="absolute right-6 top-[calc(2rem+env(safe-area-inset-top))] p-1 text-sm font-medium text-text transition-opacity hover:opacity-60"
        >
          {allSelected ? "선택 해제" : "전체선택"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          disabled={busy}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="메뉴 열기"
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
      )}

      {/* 팝오버 메뉴 — 배경 탭하면 닫힘 */}
      {menuOpen && !selecting && (
        <>
          <button
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setMenuOpen(false)}
            className="fixed inset-0 z-[65] cursor-default"
          />
          <div
            role="menu"
            className="absolute right-6 top-[calc(3.75rem+env(safe-area-inset-top))] z-[66] w-36 origin-top-right animate-modal-pop overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                fileRef.current?.click();
              }}
              className="flex w-full items-center px-4 py-3 text-sm text-text transition-colors hover:bg-line/40"
            >
              사진 추가
            </button>
            {hasPhotos && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  enterSelection();
                }}
                className="flex w-full items-center border-t border-line px-4 py-3 text-sm text-error transition-colors hover:bg-line/40"
              >
                사진 삭제
              </button>
            )}
          </div>
        </>
      )}

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
            <div className="w-56 max-w-[70vw]">
              <p className="mb-2 text-center text-sm font-medium text-white">
                업로드 중 {progress.done}/{progress.total}
              </p>
              {/* 진행 트랙 + 채움. 파일 1장 완료마다 width가 전환되어 부드럽게 채워진다. */}
              <div
                className="h-1.5 w-full overflow-hidden rounded-full bg-white/25"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-300 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

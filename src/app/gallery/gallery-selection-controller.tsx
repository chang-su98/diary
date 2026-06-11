"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useGallerySelectionStore } from "@/lib/gallery-selection-store";

// 삭제 확인 다이얼로그 + 실제 삭제 실행. 갤러리 페이지에만 마운트되어,
// 페이지를 벗어나면(언마운트) 선택 모드를 자동 종료한다.
export function GallerySelectionController() {
  const router = useRouter();
  const confirmOpen = useGallerySelectionStore((s) => s.confirmOpen);
  const selectedIds = useGallerySelectionStore((s) => s.selectedIds);
  const closeConfirm = useGallerySelectionStore((s) => s.closeConfirm);
  const exit = useGallerySelectionStore((s) => s.exit);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 갤러리 이탈 시 선택 모드 정리(스토어 getState로 최신값 직접 호출)
  useEffect(() => {
    return () => {
      useGallerySelectionStore.getState().exit();
    };
  }, []);

  if (!confirmOpen) return null;

  const ids = Array.from(selectedIds);

  async function onConfirmDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch("/api/photos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const body: unknown = await res.json().catch(() => null);
        const msg =
          body !== null &&
          typeof body === "object" &&
          "error" in body &&
          typeof body.error === "string"
            ? body.error
            : "삭제에 실패했습니다.";
        throw new Error(msg);
      }
      exit();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
      setDeleting(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center px-8"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      role="dialog"
      aria-modal="true"
      aria-label="사진 삭제 확인"
    >
      <div className="w-full max-w-xs overflow-hidden rounded-2xl bg-surface">
        <div className="px-6 pb-5 pt-6 text-center">
          <p className="text-base font-medium text-text">
            {ids.length}장의 사진을 삭제할까요?
          </p>
          <p className="mt-1 text-sm text-text-muted">삭제하면 되돌릴 수 없어요.</p>
          {error && <p className="mt-2 text-sm text-error">{error}</p>}
        </div>
        <div className="flex border-t border-line">
          <button
            type="button"
            onClick={closeConfirm}
            disabled={deleting}
            className="flex-1 border-r border-line py-3 text-sm font-medium text-text-muted transition-opacity hover:opacity-60 disabled:opacity-40"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={deleting}
            className="flex-1 py-3 text-sm font-semibold text-error transition-opacity hover:opacity-60 disabled:opacity-40"
          >
            {deleting ? "삭제 중…" : "삭제"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

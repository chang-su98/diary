"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGallerySelectionStore } from "@/lib/gallery-selection-store";
import { useGalleryStore } from "@/lib/gallery-store";
import { usePullRefreshStore } from "@/lib/pull-refresh-store";

// 타일 축소·페이드 애니메이션 시간(ms) — gallery-grid 타일 transition과 맞춘다.
const DELETE_ANIM_MS = 360;

// 삭제 확인 다이얼로그 + 실제 삭제 실행. 갤러리 페이지에만 마운트되어,
// 페이지를 벗어나면(언마운트) 선택 모드를 자동 종료한다.
export function GallerySelectionController() {
  const confirmOpen = useGallerySelectionStore((s) => s.confirmOpen);
  const selecting = useGallerySelectionStore((s) => s.selecting);
  const selectedIds = useGallerySelectionStore((s) => s.selectedIds);
  const closeConfirm = useGallerySelectionStore((s) => s.closeConfirm);
  const exit = useGallerySelectionStore((s) => s.exit);
  const startDeleting = useGalleryStore((s) => s.startDeleting);
  const finalizeDelete = useGalleryStore((s) => s.finalizeDelete);
  const setPullEnabled = usePullRefreshStore((s) => s.setEnabled);
  const finalizeTimer = useRef<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 선택 모드 동안 당겨서 새로고침을 끈다(위로 당기는 드래그 선택과 충돌·리로드 방지).
  // 선택 해제·갤러리 이탈 시 자동 복구.
  useEffect(() => {
    setPullEnabled(!selecting);
    return () => setPullEnabled(true);
  }, [selecting, setPullEnabled]);

  // 갤러리 이탈 시: 대기 중인 제거 타이머 정리 + 선택 모드 종료
  useEffect(() => {
    return () => {
      if (finalizeTimer.current !== null)
        window.clearTimeout(finalizeTimer.current);
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
      // 1) 선택한 타일을 축소·페이드 시작 + 나머지 타일은 새 위치로 흘러간다(재정렬)
      startDeleting(ids);
      // 2) 다이얼로그·선택 모드 종료(타일은 deletingIds로 계속 사라지는 중)
      exit();
      // 3) 애니메이션 종료 후 목록에서 완전히 제거(리마운트 없음 → 스크롤·누적 보존)
      finalizeTimer.current = window.setTimeout(
        () => finalizeDelete(ids),
        DELETE_ANIM_MS
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제에 실패했습니다.");
    } finally {
      // 성공(다이얼로그 닫힘)·실패 모두 로딩 해제 — 안 풀면 다음 번 열 때 "삭제 중…"으로 고정됨
      setDeleting(false);
    }
  }

  return createPortal(
    <div
      className="animate-modal-fade fixed inset-0 z-[75] flex items-center justify-center px-8"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      role="dialog"
      aria-modal="true"
      aria-label="사진 삭제 확인"
    >
      <div className="animate-modal-pop w-full max-w-xs overflow-hidden rounded-2xl bg-surface">
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

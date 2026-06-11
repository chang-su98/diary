"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// SSR(클라이언트 컴포넌트의 서버 렌더)에서 useLayoutEffect 경고를 피하기 위한 분기.
// 모듈 로드 시 1회 결정되므로 훅 호출 규칙 위반이 아니다.
const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

type Photo = {
  id: number;
  data: string;
  width: number;
  height: number;
  author: {
    username: string;
    displayName: string | null;
    avatar: string | null;
  } | null;
};

/**
 * 갤러리 메이슨리 + 사진 상세 라이트박스.
 * 타일을 누르면 등록자(아이디·프로필)와 큰 사진을 오버레이로 보여준다.
 */
export function GalleryGrid({ photos }: { photos: Photo[] }) {
  const [selected, setSelected] = useState<Photo | null>(null);

  // FLIP: 새 사진이 추가돼 메이슨리가 재배치될 때 기존 타일이 이전 위치에서
  // 새 위치로 부드럽게 이동하도록 한다. (View Transitions 대신 표준 DOM만 사용)
  const tilesRef = useRef<Map<number, HTMLElement>>(new Map());
  const lastRectsRef = useRef<Map<number, DOMRect>>(new Map());

  useIsomorphicLayoutEffect(() => {
    const prev = lastRectsRef.current;
    const next = new Map<number, DOMRect>();
    tilesRef.current.forEach((el, id) => {
      const rect = el.getBoundingClientRect();
      next.set(id, rect);
      const old = prev.get(id);
      if (!old) return; // 신규 타일은 CSS animate-tile-in으로 등장
      const dx = old.left - rect.left;
      const dy = old.top - rect.top;
      if (!dx && !dy) return;
      // Invert: 이전 위치로 즉시 되돌린 뒤
      el.style.transition = "none";
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      void el.offsetWidth; // 강제 리플로우로 시작 상태 확정
      // Play: 새 위치로 애니메이션
      el.style.transition = "transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)";
      el.style.transform = "";
      const onDone = () => {
        // 인라인 스타일 정리 → Tailwind transition-opacity(hover) 복원
        el.style.transition = "";
        el.removeEventListener("transitionend", onDone);
      };
      el.addEventListener("transitionend", onDone);
    });
    lastRectsRef.current = next;
  });

  // 모달이 열린 동안 배경 스크롤 잠금 + ESC 닫기.
  // (스크롤 잠금은 setState 미사용, 닫기는 이벤트 콜백 내 호출 → set-state-in-effect 룰 무관)
  useEffect(() => {
    if (!selected) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [selected]);

  return (
    <>
      {/* CSS columns 기반 핀터레스트식 메이슨리 — 세로 간격은 타일 mb로 부여 */}
      <div className="columns-2 gap-2 [&>*]:mb-2">
        {photos.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              if (el) tilesRef.current.set(p.id, el);
              else tilesRef.current.delete(p.id);
            }}
            type="button"
            onClick={() => setSelected(p)}
            aria-label="사진 자세히 보기"
            className="animate-tile-in block w-full break-inside-avoid overflow-hidden rounded-xl border border-line bg-bg transition-opacity hover:opacity-90 active:opacity-80"
            style={{
              // 원본 비율을 미리 잡아 레이아웃 시프트 방지
              aspectRatio: `${p.width} / ${p.height}`,
              // 최초 로드 시 가벼운 스태거(상한). 신규 업로드 타일은 i=0이라 즉시 등장
              animationDelay: `${Math.min(i, 8) * 35}ms`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL 이미지 */}
            <img
              src={p.data}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>

      {/* 모달은 body로 포털 — PageTransition의 transform 쌓임 맥락을 벗어나
          하단 탭바(z-40) 위로 dim이 올라오도록 한다 */}
      {selected &&
        createPortal(
          // 어두운 배경 아무 곳이나 누르면 닫힘 (헤더·사진은 stopPropagation)
          <div
            className="animate-modal-fade fixed inset-0 z-[60] flex flex-col bg-bg"
            role="dialog"
            aria-modal="true"
            aria-label="사진 상세"
            onClick={() => setSelected(null)}
          >
          {/* 상단: 등록자 아이디 + 프로필 사진 */}
          <div
            className="flex items-center gap-3 px-5 pb-3 pt-[calc(1rem+env(safe-area-inset-top))]"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="size-9 overflow-hidden rounded-full border border-line bg-bg">
              {selected.author?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL 이미지
                <img
                  src={selected.author.avatar}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center text-sm font-light text-text-muted">
                  {(selected.author?.username ?? "?").charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="text-sm tracking-wide text-text">
              {selected.author?.username ?? "알 수 없음"}
            </span>

            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="닫기"
              className="ml-auto p-1 text-text transition-opacity hover:opacity-60"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
                width={22}
                height={22}
                className="size-[22px]"
              >
                <path
                  d="M6 6L18 18M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </div>

          {/* 사진 자세히 보기 */}
          <div className="flex flex-1 items-center justify-center overflow-hidden px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL 이미지 */}
            <img
              src={selected.data}
              alt=""
              onClick={(e) => e.stopPropagation()}
              className="animate-modal-pop max-h-full max-w-full rounded-lg object-contain"
            />
          </div>
          </div>,
          document.body
        )}
    </>
  );
}

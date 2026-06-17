"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useGallerySelectionStore } from "@/lib/gallery-selection-store";

/**
 * 갤러리 우하단 "맨 위로" 버튼.
 * body로 포털 → 조상 래퍼(page-fade/pull-to-refresh)의 transform 영향 없이
 * 뷰포트 기준으로 고정된다(탭바와 동일). 조금이라도 스크롤하면(scrollY > 0) 노출하고,
 * 선택 모드에서는 탭바가 취소/삭제로 바뀌므로 숨긴다.
 * 표시/숨김은 언마운트가 아니라 opacity 토글로 처리해 페이드 인/아웃이 양방향으로 재생된다.
 */
export function GalleryTopButton() {
  const [scrolled, setScrolled] = useState(false);
  const selecting = useGallerySelectionStore((s) => s.selecting);

  useEffect(() => {
    // 스크롤 이벤트 콜백 내 setState → set-state-in-effect 룰 무관
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll(); // 초기 동기화(새로고침 후 스크롤 위치 복원 대비)
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // SSR에선 document가 없어 포털을 만들 수 없음 → 렌더 생략(클라이언트에서만 마운트).
  if (typeof document === "undefined") return null;

  const show = scrolled && !selecting;

  return createPortal(
    // 화면 폭과 무관하게 콘텐츠(max-w-md) 우하단에 정렬. 래퍼 자체는 클릭 통과.
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+var(--safe-bottom))] z-50 mx-auto flex w-full max-w-md justify-end px-4">
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
        aria-label="맨 위로"
        aria-hidden={!show}
        tabIndex={show ? 0 : -1}
        className={`flex size-11 items-center justify-center rounded-full border border-line bg-surface/85 text-text shadow-[0_2px_12px_rgba(0,0,0,0.12)] backdrop-blur-md transition-[opacity,transform] duration-300 ease-out hover:opacity-80 ${
          show
            ? "pointer-events-auto scale-100 opacity-100"
            : "pointer-events-none scale-90 opacity-0"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          width={20}
          height={20}
          className="size-5"
        >
          <path
            d="M12 19V5M5 12L12 5L19 12"
            stroke="currentColor"
            strokeWidth={1.8}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>,
    document.body
  );
}

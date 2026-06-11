"use client";

import { useEffect, useState } from "react";

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
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setSelected(p)}
            aria-label="사진 자세히 보기"
            className="block w-full break-inside-avoid overflow-hidden rounded-xl border border-line bg-bg transition-opacity hover:opacity-90 active:opacity-80"
            // 원본 비율을 미리 잡아 레이아웃 시프트 방지
            style={{ aspectRatio: `${p.width} / ${p.height}` }}
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

      {selected && (
        // 어두운 배경 아무 곳이나 누르면 닫힘 (헤더·사진은 stopPropagation)
        <div
          className="fixed inset-0 z-[60] flex flex-col bg-black/85"
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
            <span className="size-9 overflow-hidden rounded-full border border-white/30 bg-white/10">
              {selected.author?.avatar ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL 이미지
                <img
                  src={selected.author.avatar}
                  alt=""
                  className="size-full object-cover"
                />
              ) : (
                <span className="flex size-full items-center justify-center text-sm font-light text-white">
                  {(selected.author?.username ?? "?").charAt(0).toUpperCase()}
                </span>
              )}
            </span>
            <span className="text-sm tracking-wide text-white">
              {selected.author?.username ?? "알 수 없음"}
            </span>

            <button
              type="button"
              onClick={() => setSelected(null)}
              aria-label="닫기"
              className="ml-auto p-1 text-white/80 transition-opacity hover:opacity-60"
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
              className="max-h-full max-w-full rounded-lg object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}

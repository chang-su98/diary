"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Masonry, type RenderComponentProps } from "masonic";

// masonic은 렌더 단계에서 ResizeObserver(브라우저 전용)를 생성하므로 SSR에서 터진다.
// 서버/하이드레이션 첫 프레임엔 false, 클라이언트 마운트 후 true → Masonry를 클라이언트에서만 렌더.
// (useSyncExternalStore라 set-state-in-effect 룰·하이드레이션 불일치 모두 회피)
const subscribeNoop = () => () => {};
function useIsClient() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );
}

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
 * 레이아웃은 masonic으로 높이 균형 패킹 + 가상화 처리(즉시 배치, 위치 애니메이션 없음).
 * 타일을 누르면 등록자(아이디·프로필)와 큰 사진을 오버레이로 보여준다.
 */
export function GalleryGrid({ photos }: { photos: Photo[] }) {
  const [selected, setSelected] = useState<Photo | null>(null);
  const isClient = useIsClient();

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

  // 타일 마크업 — masonic 셀과 SSR 폴백(CSS columns)이 공유.
  // break-inside-avoid는 폴백에서만 의미 있고 masonic(절대 배치)에선 무해.
  const renderButton = (p: Photo) => (
    <button
      key={p.id}
      type="button"
      onClick={() => setSelected(p)}
      aria-label="사진 자세히 보기"
      className="block w-full break-inside-avoid overflow-hidden rounded-xl border border-line bg-bg transition-opacity hover:opacity-90 active:opacity-80"
      // 저장된 원본 비율로 높이를 미리 확정 → 이미지 로드 전에도 정확히 측정/배치
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
  );

  // masonic 셀 렌더 — data는 photos 항목
  const renderTile = ({ data }: RenderComponentProps<Photo>) =>
    renderButton(data);

  return (
    <>
      {isClient ? (
        <Masonry
          items={photos}
          columnCount={2}
          columnGutter={8}
          rowGutter={8}
          itemKey={(p) => p.id}
          render={renderTile}
        />
      ) : (
        // SSR 폴백 — masonic 마운트 전 빈 화면 깜빡임 방지 (CSS columns 메이슨리)
        <div className="columns-2 gap-2 [&>*]:mb-2">
          {photos.map(renderButton)}
        </div>
      )}

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

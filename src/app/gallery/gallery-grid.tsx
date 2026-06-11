"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
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
  width: number;
  height: number;
  author: {
    username: string;
    displayName: string | null;
    avatar: string | null;
  } | null;
};

// 이미지 서빙 URL — 바이트는 스토리지에서 라우트로 서빙(브라우저 캐시 적용)
const thumbUrl = (id: number) => `/api/photos/${id}/raw?v=thumb`;
const fullUrl = (id: number) => `/api/photos/${id}/raw?v=full`;

type PhotosPage = { photos: Photo[]; nextCursor: number | null };

/**
 * 갤러리 메이슨리 + 사진 상세 라이트박스 + 무한 스크롤.
 * 레이아웃은 masonic으로 높이 균형 패킹 + 가상화 처리(즉시 배치, 위치 애니메이션 없음).
 * 첫 페이지는 서버(initialPhotos)에서 받고, 스크롤이 끝에 가까워지면 다음 페이지를 추가 로드한다.
 * 첫 페이지가 바뀌면 부모가 key로 리마운트하므로 prop→state 동기화 effect는 두지 않는다.
 */
export function GalleryGrid({
  initialPhotos,
  initialCursor,
}: {
  initialPhotos: Photo[];
  initialCursor: number | null;
}) {
  const [selected, setSelected] = useState<Photo | null>(null);
  const isClient = useIsClient();

  // 누적 목록 + 다음 커서. initialPhotos는 시드값으로만 사용(이후 추가는 클라이언트 fetch).
  const [photos, setPhotos] = useState(initialPhotos);
  const [cursor, setCursor] = useState(initialCursor);
  const loadingRef = useRef(false); // 동시 fetch 방지

  const loadMore = useCallback(async () => {
    if (loadingRef.current || cursor === null) return;
    loadingRef.current = true;
    try {
      const res = await fetch(`/api/photos?cursor=${cursor}`);
      if (!res.ok) return;
      const page = (await res.json()) as PhotosPage;
      setPhotos((prev) => [...prev, ...page.photos]);
      setCursor(page.nextCursor);
    } catch (error) {
      console.warn("[gallery] 다음 페이지 로드 실패:", error);
    } finally {
      loadingRef.current = false;
    }
  }, [cursor]);

  // masonic이 끝에서 4칸 이내를 렌더하면 다음 페이지 로드(뷰포트 미충족 시 자동 연속 로드)
  const onRender = useCallback(
    (_start: number, stop: number, items: Photo[]) => {
      if (stop >= items.length - 4) void loadMore();
    },
    [loadMore]
  );

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
      {/* eslint-disable-next-line @next/next/no-img-element -- 라우트 서빙 이미지 */}
      <img
        src={thumbUrl(p.id)}
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
          onRender={onRender}
        />
      ) : (
        // SSR 폴백 — masonic 마운트 전 빈 화면 깜빡임 방지 (CSS columns 메이슨리)
        <div className="columns-2 gap-2 [&>*]:mb-2">
          {photos.map(renderButton)}
        </div>
      )}

      {/* 상세 모달은 body로 포털 + 선택된 사진 id로 key → 사진 전환 시 리마운트(원본 재fetch) */}
      {selected &&
        createPortal(
          <PhotoDetail
            key={selected.id}
            photo={selected}
            onClose={() => setSelected(null)}
          />,
          document.body
        )}
    </>
  );
}

/**
 * 사진 상세 라이트박스. 그리드에서 이미 받은 썸네일(캐시)을 즉시 띄우고,
 * 원본 URL을 백그라운드로 프리로드한 뒤 도착하면 교체한다(별도 JSON fetch 없음).
 * 선택 사진 id로 부모가 key를 주어 사진 전환 시 리마운트 → 매번 새 프리로드.
 */
function PhotoDetail({
  photo,
  onClose,
}: {
  photo: Photo;
  onClose: () => void;
}) {
  // 썸네일 URL로 시작(그리드에서 캐시됨 → 즉시 표시), 원본 로드되면 교체
  const [src, setSrc] = useState(() => thumbUrl(photo.id));

  // 원본 프리로드 — setState는 img onload 콜백에서만 호출(set-state-in-effect 룰 무관)
  useEffect(() => {
    const img = new Image();
    img.src = fullUrl(photo.id);
    img.onload = () => setSrc(fullUrl(photo.id));
    return () => {
      img.onload = null;
    };
  }, [photo.id]);

  return (
    // 어두운 배경 아무 곳이나 누르면 닫힘 (헤더·사진은 stopPropagation)
    <div
      className="animate-modal-fade fixed inset-0 z-[60] flex flex-col bg-bg"
      role="dialog"
      aria-modal="true"
      aria-label="사진 상세"
      onClick={onClose}
    >
      {/* 상단: 등록자 아이디 + 프로필 사진 */}
      <div
        className="flex items-center gap-3 px-5 pb-3 pt-[calc(1rem+env(safe-area-inset-top))]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="size-9 overflow-hidden rounded-full border border-line bg-bg">
          {photo.author?.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL 이미지
            <img
              src={photo.author.avatar}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            <span className="flex size-full items-center justify-center text-sm font-light text-text-muted">
              {(photo.author?.username ?? "?").charAt(0).toUpperCase()}
            </span>
          )}
        </span>
        <span className="text-sm tracking-wide text-text">
          {photo.author?.username ?? "알 수 없음"}
        </span>

        <button
          type="button"
          onClick={onClose}
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

      {/* 사진 자세히 보기 — 썸네일 즉시 표시 후 원본으로 교체 */}
      <div className="flex flex-1 items-center justify-center overflow-hidden px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {/* eslint-disable-next-line @next/next/no-img-element -- 라우트 서빙 이미지 */}
        <img
          src={src}
          alt=""
          onClick={(e) => e.stopPropagation()}
          className="animate-modal-pop max-h-full max-w-full rounded-lg object-contain"
        />
      </div>
    </div>
  );
}

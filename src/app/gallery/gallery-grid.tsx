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
import { useGalleryStore } from "@/lib/gallery-store";
import { useGallerySelectionStore } from "@/lib/gallery-selection-store";
import type { GalleryPhoto as Photo } from "./types";

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

// 이미지 서빙 URL — 원본을 라우트로 서빙(브라우저 캐시 적용). 그리드·모달 공용이라
// 그리드에서 받은 이미지가 캐시되어 모달이 즉시 뜬다.
const rawUrl = (id: number) => `/api/photos/${id}/raw`;

// 셀 위치(top/left) 변화에 트랜지션 → 사진 추가 시 기존 사진들이 부드럽게 밀려난다.
const ITEM_STYLE = {
  transition:
    "top 0.4s cubic-bezier(0.22, 1, 0.36, 1), left 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
};

// id 기준 중복 제거(앞선 항목 우선) — 스토어 added와 서버 photos가 겹칠 때 대비
function dedupeById(list: Photo[]): Photo[] {
  const seen = new Set<number>();
  const out: Photo[] = [];
  for (const p of list) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      out.push(p);
    }
  }
  return out;
}

// 그리드 타일. 이미지 로드 시 opacity 트랜지션으로 부드럽게 fade-in.
// 캐시된 이미지(스크롤 복귀 등)는 ref에서 complete를 확인해 바로 보이게 한다.
// (React state/effect 없이 DOM만 만져 set-state-in-effect 룰 회피)
function GalleryTile({
  photo,
  onSelect,
}: {
  photo: Photo;
  onSelect: (photo: Photo) => void;
}) {
  // 자기 선택 여부만 구독(불리언 슬라이스) → 자기 것이 바뀔 때만 리렌더
  const selecting = useGallerySelectionStore((s) => s.selecting);
  const selected = useGallerySelectionStore((s) => s.selectedIds.has(photo.id));
  const toggle = useGallerySelectionStore((s) => s.toggle);

  return (
    <button
      type="button"
      onClick={() => (selecting ? toggle(photo.id) : onSelect(photo))}
      aria-label={
        selecting ? (selected ? "선택 해제" : "사진 선택") : "사진 자세히 보기"
      }
      aria-pressed={selecting ? selected : undefined}
      className={`relative block w-full break-inside-avoid overflow-hidden rounded-xl border bg-bg transition hover:opacity-90 active:opacity-80 ${
        selected ? "border-[#007aff] ring-2 ring-[#007aff]" : "border-line"
      }`}
      // 저장된 원본 비율로 높이를 미리 확정 → 이미지 로드 전에도 정확히 측정/배치
      style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 라우트 서빙 이미지 */}
      <img
        src={rawUrl(photo.id)}
        alt=""
        loading="lazy"
        ref={(el) => {
          // 이미 캐시되어 로드 완료면 트랜지션 없이 즉시 표시(스크롤 복귀 시 재fade 방지)
          if (el?.complete) {
            el.style.transition = "none";
            el.style.opacity = "1";
          }
        }}
        onLoad={(e) => {
          e.currentTarget.style.opacity = "1";
        }}
        className="size-full object-cover opacity-0 transition-opacity duration-500"
      />

      {/* 선택 모드 좌상단 체크 원 — 선택됨: 파란 원+흰 체크 / 미선택: 빈 원 */}
      {selecting && (
        <span
          aria-hidden
          className={`absolute left-2 top-2 flex size-6 animate-modal-pop items-center justify-center rounded-full border transition-colors ${
            selected
              ? "border-[#007aff] bg-[#007aff]"
              : "border-white/80 bg-black/20"
          }`}
        >
          {selected && (
            <svg
              viewBox="0 0 24 24"
              width={14}
              height={14}
              fill="none"
              className="text-white"
            >
              <path
                d="M5 12.5l4 4 10-10"
                stroke="currentColor"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
      )}
    </button>
  );
}

type PhotosPage = { photos: Photo[]; nextCursor: number | null };

/**
 * 갤러리 = 메이슨리 그리드(+무한 스크롤) + 상세 라이트박스.
 * 모달 상태(selected)는 GalleryGrid가, 그리드는 PhotoMasonry가 따로 들고 있어
 * 모달을 열고 닫아도 그리드가 리렌더되지 않는다(깜빡임 방지).
 */
export function GalleryGrid({
  initialPhotos,
  initialCursor,
}: {
  initialPhotos: Photo[];
  initialCursor: number | null;
}) {
  const [selected, setSelected] = useState<Photo | null>(null);
  const clearAdded = useGalleryStore((s) => s.clear);

  // 이 인스턴스는 서버 재시드(router.refresh / pull-refresh)로 새 key에 마운트되며,
  // 이때 initialPhotos엔 업로드분이 이미 포함돼 있다. 낙관적 추가 스토어(added)를 비워
  // 세션 내내 누적되는 것을 막는다. 서버 목록과 내용이 같아 화면 깜빡임은 없다.
  useEffect(() => {
    clearAdded();
  }, [clearAdded]);

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
      {/* onSelect는 안정적(setSelected) → selected가 바뀌어도 그리드는 리렌더 안 됨 */}
      <PhotoMasonry
        initialPhotos={initialPhotos}
        initialCursor={initialCursor}
        onSelect={setSelected}
      />

      {/* 상세 모달은 body로 포털 + 선택 사진 id로 key */}
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
 * 메이슨리 그리드 + 무한 스크롤. 모달 상태와 분리되어 있어 모달 토글에 영향받지 않는다.
 * 첫 페이지는 서버(initialPhotos)에서 받고, 스크롤이 끝에 가까워지면 다음 페이지를 추가 로드한다.
 */
function PhotoMasonry({
  initialPhotos,
  initialCursor,
  onSelect,
}: {
  initialPhotos: Photo[];
  initialCursor: number | null;
  onSelect: (photo: Photo) => void;
}) {
  const isClient = useIsClient();

  // 누적 목록 + 다음 커서. initialPhotos는 시드값으로만 사용(이후 추가는 클라이언트 fetch).
  const [photos, setPhotos] = useState(initialPhotos);
  const [cursor, setCursor] = useState(initialCursor);
  const loadingRef = useRef(false); // 동시 fetch 방지

  // 업로드 직후 추가된 사진(스토어). 맨 앞에 합쳐 같은 masonic에서 위치 트랜지션 발생.
  const added = useGalleryStore((s) => s.added);
  // 슬라이드 애니메이션 후 bumpLayout()으로 증가 → <Masonry> key로 써서 그 자식만
  // 리마운트(레이아웃 재계산). photos·cursor 상태는 PhotoMasonry에 남아 보존된다.
  const layoutNonce = useGalleryStore((s) => s.layoutNonce);
  const items = dedupeById([...added, ...photos]);

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
    (_start: number, stop: number, rendered: Photo[]) => {
      if (stop >= rendered.length - 4) void loadMore();
    },
    [loadMore]
  );

  // 안정적인 render → masonic 셀 churn(깜빡임) 최소화. onSelect는 prop이라 안정적.
  const renderTile = useCallback(
    ({ data }: RenderComponentProps<Photo>) => (
      <GalleryTile photo={data} onSelect={onSelect} />
    ),
    [onSelect]
  );

  if (!isClient) {
    // SSR 폴백 — masonic 마운트 전 빈 화면 깜빡임 방지 (CSS columns 메이슨리)
    return (
      <div className="columns-3 gap-2 [&>*]:mb-2">
        {items.map((p) => (
          <GalleryTile key={p.id} photo={p} onSelect={onSelect} />
        ))}
      </div>
    );
  }

  return (
    <Masonry
      key={layoutNonce}
      items={items}
      columnCount={3}
      columnGutter={8}
      rowGutter={8}
      itemKey={(p) => p.id}
      render={renderTile}
      onRender={onRender}
      itemStyle={ITEM_STYLE}
    />
  );
}

/**
 * 사진 상세 라이트박스. 그리드와 동일한 원본 URL을 쓰므로 그리드에서 캐시된
 * 이미지가 즉시 표시된다(별도 프리로드/스왑 불필요).
 */
function PhotoDetail({
  photo,
  onClose,
}: {
  photo: Photo;
  onClose: () => void;
}) {
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

      {/* 사진 자세히 보기 — 그리드와 같은 원본(캐시됨) */}
      <div className="flex flex-1 items-center justify-center overflow-hidden px-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        {/* eslint-disable-next-line @next/next/no-img-element -- 라우트 서빙 이미지 */}
        <img
          src={rawUrl(photo.id)}
          alt=""
          onClick={(e) => e.stopPropagation()}
          className="animate-modal-pop max-h-full max-w-full rounded-lg object-contain"
        />
      </div>
    </div>
  );
}

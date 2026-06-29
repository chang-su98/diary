"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useGalleryStore } from "@/lib/gallery-store";
import { useGallerySelectionStore } from "@/lib/gallery-selection-store";
import { useDragSelect } from "./use-drag-select";
import { PhotoLikeButton } from "./gallery-like-button";
import type { GalleryPhoto as Photo } from "./types";

// 메이슨리 레이아웃 상수 — 3열, 셀 간격 8px(가로·세로 동일).
const COLUMNS = 3;
const GUTTER = 6;
// 위치 변화 트랜지션 → 추가/삭제 시 타일이 새 위치로 부드럽게 흘러간다(아이폰 사진첩식).
const REFLOW_TRANSITION =
  "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)";

type Tile = { id: number; x: number; y: number; w: number; h: number };
type Layout = { tiles: Map<number, Tile>; height: number };

// 절대위치 메이슨리 레이아웃 계산. 각 사진을 가장 짧은 열에 차례로 쌓아
// {x, y, 너비, 높이}를 구하고 전체 높이를 반환한다. (순수 함수 — 렌더 중 호출)
function computeLayout(list: Photo[], containerWidth: number): Layout {
  const colW = (containerWidth - GUTTER * (COLUMNS - 1)) / COLUMNS;
  const heights = new Array<number>(COLUMNS).fill(0);
  const tiles = new Map<number, Tile>();
  for (const p of list) {
    // 가장 낮은 열 선택 → 그 자리에 배치 후 열 높이 누적
    let col = 0;
    for (let c = 1; c < COLUMNS; c++) {
      if (heights[c] < heights[col]) col = c;
    }
    const h = colW * (p.height / p.width);
    tiles.set(p.id, { id: p.id, x: col * (colW + GUTTER), y: heights[col], w: colW, h });
    heights[col] += h + GUTTER;
  }
  const max = Math.max(0, ...heights);
  return { tiles, height: Math.max(0, max - GUTTER) };
}

// 이미지 서빙 URL — 원본을 라우트로 서빙(브라우저 캐시 적용). 그리드·모달 공용이라
// 그리드에서 받은 이미지가 캐시되어 모달이 즉시 뜬다.
const rawUrl = (id: number) => `/api/photos/${id}/raw`;

// 상세 모달 닫힘 애니메이션 시간(ms) — globals.css의 modal-*-out(0.18s)과 맞춘다.
const MODAL_ANIM_MS = 180;

// 상세 모달에서 좌우 스와이프로 인정할 최소 가로 이동(px). 이보다 작거나 세로가 더
// 크면 단순 탭/세로 제스처로 보고 넘김을 발동하지 않는다.
const SWIPE_THRESHOLD = 45;

// 업로드 날짜 표시 — ISO 문자열을 로컬 기준 YYYY.MM.DD로. 파싱 실패 시 빈 문자열.
function formatPhotoDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}.${m}.${day}`;
}

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
  onOpen,
  shouldSuppressClick,
}: {
  photo: Photo;
  // 상세 열기 — 호출부에서 (목록, 인덱스)를 미리 바인딩해 넘긴다(스와이프 네비게이션용)
  onOpen: () => void;
  // 드래그(사각형) 선택 직후 따라오는 click 토글을 건너뛸지 — 선택 모드에서만 의미 있음
  shouldSuppressClick?: () => boolean;
}) {
  // 자기 선택 여부만 구독(불리언 슬라이스) → 자기 것이 바뀔 때만 리렌더
  const selecting = useGallerySelectionStore((s) => s.selecting);
  const selected = useGallerySelectionStore((s) => s.selectedIds.has(photo.id));
  const toggle = useGallerySelectionStore((s) => s.toggle);
  // 삭제 중이면 타일을 원래 자리에서 축소·페이드아웃(나머지 타일은 빈자리로 흘러간다)
  const deleting = useGalleryStore((s) => s.deletingIds.has(photo.id));

  return (
    <button
      type="button"
      onClick={() => {
        if (!selecting) return onOpen();
        // 직전이 사각형 드래그 선택이었으면 따라오는 click의 토글을 건너뛴다
        if (shouldSuppressClick?.()) return;
        toggle(photo.id);
      }}
      aria-label={
        selecting ? (selected ? "선택 해제" : "사진 선택") : "사진 자세히 보기"
      }
      aria-pressed={selecting ? selected : undefined}
      className={`relative block w-full break-inside-avoid overflow-hidden rounded-xl border bg-bg transition-[opacity,transform,border-color,box-shadow] duration-300 hover:opacity-90 active:opacity-80 ${
        selected ? "border-[#007aff] ring-2 ring-[#007aff]" : "border-line"
      } ${deleting ? "scale-[0.4] opacity-0" : ""} ${
        // 선택 모드에선 타일 위 드래그가 스크롤되지 않고 사각형 선택으로 동작하게 한다
        selecting ? "touch-none select-none" : ""
      }`}
      // 저장된 원본 비율로 높이를 미리 확정 → 이미지 로드 전에도 정확히 측정/배치
      style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 라우트 서빙 이미지 */}
      <img
        src={rawUrl(photo.id)}
        alt=""
        loading="lazy"
        decoding="async"
        draggable={false}
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

      {/* 선택 모드 좌상단 체크 원 — 항상 마운트해 두고 opacity로 페이드(언마운트 시
          스냅 방지). 선택 모드일 때 등장, 취소 시 부드럽게 사라진다. */}
      <span
        aria-hidden
        className={`pointer-events-none absolute left-2 top-2 flex size-6 items-center justify-center rounded-full border transition-[opacity,transform,background-color,border-color] duration-200 ${
          selecting ? "scale-100 opacity-100" : "scale-75 opacity-0"
        } ${
          selected ? "border-[#007aff] bg-[#007aff]" : "border-white/80 bg-black/20"
        }`}
      >
        <svg
          viewBox="0 0 24 24"
          width={14}
          height={14}
          fill="none"
          className={`text-white transition-opacity duration-200 ${
            selected ? "opacity-100" : "opacity-0"
          }`}
        >
          <path
            d="M5 12.5l4 4 10-10"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}

type PhotosPage = { photos: Photo[]; nextCursor: number | null };

/**
 * 갤러리 = 메이슨리 그리드(+무한 스크롤) + 상세 라이트박스.
 * 모달 상태(selected)는 GalleryGrid가, 그리드는 PhotoMasonry가 따로 들고 있어
 * 모달을 열고 닫아도 그리드가 리렌더되지 않는다(깜빡임 방지).
 */
// 상세 모달의 등장 방향 — 처음 열림(팝업) / 다음(오른쪽에서) / 이전(왼쪽에서).
type DetailDir = "open" | "next" | "prev";
// 상세 모달 상태 — 열 때의 목록 스냅샷 + 현재 인덱스 + 등장 방향.
// 목록은 여는 순간 고정(스냅샷)이라 모달이 열린 동안 추가 로딩/삭제에 흔들리지 않는다.
type DetailState = { list: Photo[]; index: number; dir: DetailDir };

export function GalleryGrid({
  initialPhotos,
  initialCursor,
}: {
  initialPhotos: Photo[];
  initialCursor: number | null;
}) {
  const [detail, setDetail] = useState<DetailState | null>(null);
  // 닫힘 애니메이션을 위해 잠깐 유지 — closing 동안 역방향 애니 재생 후 언마운트
  const [closing, setClosing] = useState(false);
  const closeTimer = useRef<number | null>(null);
  // 닫기 1회 보장 플래그(동기). history.back()은 popstate가 비동기로 와서 그 사이
  // 두 번째 닫기(ESC 연타·X 더블탭·닫히는 중 추가 닫기)가 back()을 또 호출하면
  // 모달 항목 다음으로 갤러리 라우트까지 pop되어 화면 밖으로 튕긴다. 이를 막는다.
  const closeRequested = useRef(false);
  const clearAdded = useGalleryStore((s) => s.clear);

  const openDetail = useCallback((list: Photo[], index: number) => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    closeRequested.current = false; // 새로 열면 닫기 잠금 해제
    setClosing(false);
    setDetail({ list, index, dir: "open" });
    // 모달 열림을 history 항목으로 쌓는다 → 물리 뒤로가기(안드로이드 홈바)가
    // 이전 페이지로 가지 않고 이 항목을 pop하며 모달만 닫히게 한다(popstate 핸들러).
    // 이미 modal 항목이 top이면(닫힘 애니 중 재오픈 등) 재push하지 않아 history 누적을
    // 막는다. 모달은 전체화면 오버레이(z-60 > 탭바 z-40)라 열린 동안 탭 이동이 막히고
    // body 스크롤도 잠겨 일반 UI로는 뒤로가기 외 이탈 경로가 없다. 다만 프로그램적
    // 라우팅(router.push)을 모달 열린 채 호출하면 이 항목 1개가 스택에 남을 수 있다 —
    // 현재 그런 호출 경로는 없고, 발생해도 뒤로가기 1회가 삼켜지는 정도라 허용한다.
    const histState = window.history.state as { galleryModal?: boolean } | null;
    if (!histState?.galleryModal) {
      window.history.pushState({ galleryModal: true }, "");
    }
  }, []);

  // 이전/다음 사진으로 이동(모달 유지). 경계를 벗어나면 무시한다. 좌우 넘김은 history를
  // 건드리지 않아(열림 항목 1개만 유지) 뒤로가기 1회로 항상 모달이 닫힌다.
  // 함수형 업데이트라 키보드/스와이프 핸들러가 재바인딩 없이도 항상 최신 인덱스를 본다.
  const navigate = useCallback((delta: number) => {
    setDetail((cur) => {
      if (!cur) return cur;
      const next = cur.index + delta;
      if (next < 0 || next >= cur.list.length) return cur;
      return { list: cur.list, index: next, dir: delta > 0 ? "next" : "prev" };
    });
  }, []);

  // 닫힘 애니메이션 실행 후 언마운트. 실제 닫기는 popstate(뒤로가기) 경로로만 일어난다.
  const requestClose = useCallback(() => {
    if (closeTimer.current !== null) return; // 이미 닫는 중 — 중복 popstate 무시
    closeRequested.current = true; // 물리 뒤로가기 경로도 잠가 이후 back() 중복 차단
    setClosing(true);
    closeTimer.current = window.setTimeout(() => {
      setDetail(null);
      setClosing(false);
      closeTimer.current = null;
    }, MODAL_ANIM_MS);
  }, []);

  // 사용자 닫기(X·배경·ESC)는 history를 되돌려 popstate 경로로 닫는다 →
  // 물리 뒤로가기와 동일하게 동작하고, 쌓아둔 history 항목도 정확히 소비된다.
  const closeModal = useCallback(() => {
    if (closeRequested.current) return; // 이미 닫기 요청됨 — 두 번째 back() 무시
    closeRequested.current = true;
    window.history.back();
  }, []);

  // 이 인스턴스는 서버 재시드(router.refresh / pull-refresh)로 새 key에 마운트되며,
  // 이때 initialPhotos엔 업로드분이 이미 포함돼 있다. 낙관적 추가 스토어(added)를 비워
  // 세션 내내 누적되는 것을 막는다. 서버 목록과 내용이 같아 화면 깜빡임은 없다.
  useEffect(() => {
    clearAdded();
  }, [clearAdded]);

  // 모달이 열린 동안 배경 스크롤 잠금 + 키보드(ESC 닫기 / ← → 넘김).
  // open(불리언)에만 의존 → 좌우 넘김으로 detail이 바뀌어도 재실행되지 않아(콜백 안정)
  // 스크롤 잠금·리스너가 그대로 유지된다. (스크롤 잠금은 setState 미사용 → 룰 무관)
  const open = detail !== null;
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeModal();
      else if (e.key === "ArrowRight") navigate(1);
      else if (e.key === "ArrowLeft") navigate(-1);
    };
    // 물리 뒤로가기(안드로이드 홈바)·제스처 → openDetail이 쌓은 history 항목이 pop되며
    // popstate 발생 → 이전 페이지로 가지 않고 모달만 닫는다.
    const onPop = () => requestClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("popstate", onPop);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("popstate", onPop);
    };
  }, [open, requestClose, closeModal, navigate]);

  // 인접 사진 프리로드 — 좌우 넘김 시 즉시 뜨도록 미리 디코드(브라우저 캐시에 적재).
  useEffect(() => {
    if (!detail) return;
    for (const i of [detail.index - 1, detail.index + 1]) {
      const p = detail.list[i];
      if (p) {
        const img = new window.Image();
        img.src = rawUrl(p.id);
      }
    }
  }, [detail]);

  // 언마운트 시 대기 중인 닫힘 타이머 정리
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    },
    []
  );

  const current = detail ? detail.list[detail.index] : null;

  return (
    <>
      {/* onSelect는 안정적(openDetail) → detail이 바뀌어도 그리드는 리렌더 안 됨 */}
      <PhotoMasonry
        initialPhotos={initialPhotos}
        initialCursor={initialCursor}
        onSelect={openDetail}
      />

      {/* 상세 모달은 body로 포털. 넘김 동안엔 마운트를 유지(배경 재페이드 방지)하고
          내부 이미지만 방향별 애니로 교체한다. closing 동안 역방향 애니 후 언마운트 */}
      {current &&
        detail &&
        createPortal(
          <PhotoDetail
            photo={current}
            dir={detail.dir}
            closing={closing}
            hasPrev={detail.index > 0}
            hasNext={detail.index < detail.list.length - 1}
            onPrev={() => navigate(-1)}
            onNext={() => navigate(1)}
            onClose={closeModal}
          />,
          document.body
        )}
    </>
  );
}

/**
 * 메이슨리 그리드 + 무한 스크롤. 모달 상태와 분리되어 있어 모달 토글에 영향받지 않는다.
 * 첫 페이지는 서버(initialPhotos)에서 받고, 스크롤이 끝에 가까워지면 다음 페이지를 추가 로드한다.
 * 레이아웃을 직접 계산해 각 타일을 transform으로 배치 → 추가·삭제 시 남은 타일이
 * 새 위치로 부드럽게 흘러간다(아이폰 사진첩식 재정렬).
 */
function PhotoMasonry({
  initialPhotos,
  initialCursor,
  onSelect,
}: {
  initialPhotos: Photo[];
  initialCursor: number | null;
  // 상세 열기 — 현재 보이는 목록 스냅샷과 클릭한 인덱스를 넘긴다(스와이프 네비게이션용)
  onSelect: (list: Photo[], index: number) => void;
}) {
  // 누적 목록 + 다음 커서. initialPhotos는 시드값으로만 사용(이후 추가는 클라이언트 fetch).
  const [photos, setPhotos] = useState(initialPhotos);
  const [cursor, setCursor] = useState(initialCursor);
  const loadingRef = useRef(false); // 동시 fetch 방지
  const retryRef = useRef(0); // loadMore 일시 오류 재시도 횟수(백오프)
  const retryTimer = useRef<number | null>(null);
  // 재시도 타이머가 자기참조 없이 항상 최신 loadMore를 호출하도록 ref로 우회
  const loadMoreRef = useRef<(() => void) | null>(null);

  // 컨테이너 실제 너비(열 폭 계산용). 0이면 아직 미측정 → SSR/첫 프레임 CSS columns 폴백.
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // ResizeObserver 콜백은 비동기 → 렌더/이펙트 동기 구간 밖에서 setState (룰 위반 아님)
    const ro = new ResizeObserver((entries) => {
      setWidth(entries[0]?.contentRect.width ?? 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 업로드 직후 추가분(prepend) + 삭제 애니메이션/제거 상태(스토어)
  const added = useGalleryStore((s) => s.added);
  const deletingIds = useGalleryStore((s) => s.deletingIds);
  const removedIds = useGalleryStore((s) => s.removedIds);
  // 화면에 살아있는 전체 목록(제거 완료분 제외)
  const items = dedupeById([...added, ...photos]).filter(
    (p) => !removedIds.has(p.id)
  );
  // 삭제 진행 중 타일은 원래 자리(full)에 두고 축소·페이드, 나머지는 그들을 뺀
  // 레이아웃(live)으로 흘러가게 한다 → 두 동작이 동시에 부드럽게 일어난다.
  const live = computeLayout(
    items.filter((p) => !deletingIds.has(p.id)),
    width
  );
  const full =
    deletingIds.size > 0 ? computeLayout(items, width) : live;

  // 전체선택(+ 위치 버튼)의 소스 — 현재 보이는 id 목록을 선택 스토어에 동기화
  const setAllIds = useGallerySelectionStore((s) => s.setAllIds);
  useEffect(() => {
    setAllIds(items.map((p) => p.id));
  }, [items, setAllIds]);

  // 사각형(고무줄) 드래그 선택(선택 모드에서만 동작). 박스는 보이지 않고 선택만 일어난다.
  const selecting = useGallerySelectionStore((s) => s.selecting);
  const tileRects = Array.from(live.tiles.values());
  const { onPointerDown, shouldSuppressClick } = useDragSelect({
    selecting,
    containerRef,
    tiles: tileRects,
  });

  const loadMore = useCallback(async () => {
    if (loadingRef.current || cursor === null) return;
    loadingRef.current = true;
    try {
      const res = await fetch(`/api/photos?cursor=${cursor}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const page = (await res.json()) as PhotosPage;
      setPhotos((prev) => [...prev, ...page.photos]);
      setCursor(page.nextCursor);
      retryRef.current = 0; // 성공 → 재시도 카운트 리셋
    } catch (error) {
      console.warn("[gallery] 다음 페이지 로드 실패:", error);
      // 센티넬이 계속 교차 상태면 IntersectionObserver가 재발화하지 않아 영구
      // 중단될 수 있다 → 일시 오류를 백오프로 제한 재시도(최대 3회)해 자가복구.
      if (retryRef.current < 3) {
        retryRef.current += 1;
        // 드물게 IO 트리거와 재시도가 겹쳐 이전 타이머가 유실되지 않도록 먼저 정리(N-4)
        if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
        retryTimer.current = window.setTimeout(
          () => loadMoreRef.current?.(),
          1500 * retryRef.current
        );
      }
    } finally {
      loadingRef.current = false;
    }
  }, [cursor]);

  // 재시도 타이머가 최신 loadMore를 호출하도록 동기화 + 언마운트 시 타이머 정리
  useEffect(() => {
    loadMoreRef.current = loadMore;
  }, [loadMore]);
  useEffect(
    () => () => {
      if (retryTimer.current !== null) window.clearTimeout(retryTimer.current);
    },
    []
  );

  // 바닥 센티넬이 뷰포트 근처에 들어오면 다음 페이지 로드(뷰포트 미충족 시 연속 로드).
  const sentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || cursor === null) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "800px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [cursor, loadMore]);

  // 더 불러올 것도 없고 비었으면 빈 갤러리 안내(삭제로 전부 비운 경우).
  // (서버에 더 있으면 cursor!=null → 아래 바닥 센티넬이 뷰포트에 들어와 자동 로드)
  if (items.length === 0 && cursor === null) {
    return (
      <p className="mt-24 text-center text-sm tracking-wide text-text-muted">
        아직 사진이 없어요.
        <br />
        오른쪽 위 + 로 추가해 보세요.
      </p>
    );
  }

  const measured = width > 0;

  return (
    <>
      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        // 선택 모드에선 그리드 위 드래그가 스크롤되지 않고 사각형 선택으로 동작하게 한다
        className={`relative ${selecting ? "touch-none select-none" : ""}`}
        // 최종(live) 높이로 두면 삭제 시작과 동시에 페이지 높이가 안정된다.
        // 삭제 중 타일은 absolute라 잠시 컨테이너 밖으로 나가도 그대로 축소·소멸한다.
        style={measured ? { height: live.height } : undefined}
      >
        {measured ? (
          items.map((p, i) => {
            const t = deletingIds.has(p.id)
              ? full.tiles.get(p.id)
              : live.tiles.get(p.id);
            if (!t) return null;
            return (
              <div
                key={p.id}
                className="absolute left-0 top-0"
                style={{
                  width: t.w,
                  transform: `translate3d(${t.x}px, ${t.y}px, 0)`,
                  transition: REFLOW_TRANSITION,
                }}
              >
                <GalleryTile
                  photo={p}
                  onOpen={() => onSelect(items, i)}
                  shouldSuppressClick={shouldSuppressClick}
                />
              </div>
            );
          })
        ) : (
          // 너비 측정 전 폴백 — CSS columns 메이슨리(SSR·첫 프레임 깜빡임 방지)
          <div className="columns-3 gap-1.5 [&>*]:mb-1.5">
            {items.map((p, i) => (
              <GalleryTile
                key={p.id}
                photo={p}
                onOpen={() => onSelect(items, i)}
                shouldSuppressClick={shouldSuppressClick}
              />
            ))}
          </div>
        )}
      </div>
      {cursor !== null && <div ref={sentinelRef} className="h-1 w-full" />}
    </>
  );
}

// 등장 방향별 이미지 애니메이션 — 처음 열림은 팝업, 좌우 넘김은 해당 방향 슬라이드.
const DETAIL_IMG_ANIM: Record<DetailDir, string> = {
  open: "animate-modal-pop",
  next: "animate-photo-next",
  prev: "animate-photo-prev",
};

/**
 * 사진 상세 라이트박스. 그리드와 동일한 원본 URL을 쓰므로 그리드에서 캐시된
 * 이미지가 즉시 표시된다. 좌우 스와이프(또는 ← → / 화살표 버튼)로 이웃 사진을 넘긴다.
 * 모달은 넘기는 동안 마운트를 유지하고 내부 <img>만 key 교체로 방향 애니를 재생한다.
 */
function PhotoDetail({
  photo,
  dir,
  closing,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
}: {
  photo: Photo;
  dir: DetailDir;
  closing: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  // 스와이프 추적 — 시작 좌표와 "넘김 발동 여부". 넘김 직후 따라오는 click이
  // 배경 닫힘으로 이어지지 않도록 capture 단계에서 1회 흡수한다.
  const start = useRef<{ x: number; y: number } | null>(null);
  const swiped = useRef(false);
  // 포커스 트랩·복원용
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY };
    swiped.current = false;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    // 가로 이동이 충분하고 세로보다 우세할 때만 넘김(세로 제스처/단순 탭 제외)
    if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dx) <= Math.abs(dy)) return;
    swiped.current = true;
    if (dx < 0) onNext();
    else onPrev();
  };
  // 브라우저가 가로 제스처를 가로채면(iOS 엣지 뒤로가기 등) pointerup 대신 cancel이
  // 오므로 추적 상태를 정리한다(start 잔존·오발동 방지). touch-none과 함께 작동.
  const onPointerCancel = () => {
    start.current = null;
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (swiped.current) {
      e.stopPropagation();
      swiped.current = false;
    }
  };

  // 모달 열림 시 다이얼로그 컨테이너로 초기 포커스 이동, 닫힐 때 직전 포커스 복원(접근성).
  // 버튼이 아닌 컨테이너(tabIndex=-1)에 포커스를 둬서 X 버튼에 포커스 링이 칠해지지 않게 한다.
  // PhotoDetail은 열 때마다 새로 마운트되고 넘김 중엔 유지되므로 1회만 실행된다.
  // (focus 호출은 setState가 아니므로 set-state-in-effect 룰과 무관)
  // preventScroll: 포커스 이동으로 화면 밖 타일이 끌려와 스크롤이 튀는 것 방지.
  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus({ preventScroll: true });
    return () => prevActive?.focus?.({ preventScroll: true });
  }, []);

  // 경계 도달로 화살표 버튼이 사라지면(hasPrev/hasNext flip) 그 버튼에 있던 포커스가
  // 다이얼로그 밖(body)으로 떨어져 트랩이 일시 무력화된다 → 컨테이너로 회수한다.
  // (버튼이 아닌 컨테이너로 회수해야 스와이프마다 X 버튼에 포커스 링이 뜨지 않는다.)
  // 버튼 마운트/언마운트는 hasPrev·hasNext 변화에만 일어나므로 그때만 점검한다.
  useEffect(() => {
    const a = document.activeElement;
    if (a instanceof HTMLElement && !dialogRef.current?.contains(a)) {
      dialogRef.current?.focus({ preventScroll: true });
    }
  }, [hasPrev, hasNext]);

  // 포커스 트랩 — Tab이 모달 밖(배경 탭바·업로드 버튼)으로 새지 않게 순환시킨다.
  const onKeyDownTrap = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    );
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    // 어두운 배경 아무 곳이나 누르면 닫힘 (헤더·사진은 stopPropagation).
    // 좌우 스와이프는 어디서 시작하든 넘김으로 처리한다.
    <div
      ref={dialogRef}
      // touch-none: 가로 스와이프를 브라우저 기본 제스처(스크롤·뒤로가기)와 경쟁시키지
      // 않고 우리가 처리한다. 모달은 스크롤이 없어 부작용 없음.
      className={`fixed inset-0 z-[60] flex flex-col touch-none bg-bg focus:outline-none ${
        closing ? "animate-modal-fade-out" : "animate-modal-fade"
      }`}
      role="dialog"
      aria-modal="true"
      aria-label="사진 상세"
      tabIndex={-1}
      onClick={onClose}
      onClickCapture={onClickCapture}
      onKeyDown={onKeyDownTrap}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      {/* 상단: 등록자 아이디 + 프로필 사진 + 업로드 날짜 */}
      <div
        className="flex items-center gap-3 px-5 pb-3 pt-[calc(1rem+var(--safe-top))]"
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
        <div className="flex flex-col">
          <span className="text-sm tracking-wide text-text">
            {photo.author?.username ?? "알 수 없음"}
          </span>
          <span className="text-xs tracking-wide text-text-muted">
            {formatPhotoDate(photo.createdAt)}
          </span>
        </div>

        {/* 좋아요(하트) — ml-auto로 우측 정렬, 닫기 버튼이 그 옆에 온다 */}
        <PhotoLikeButton photoId={photo.id} />

        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="p-1 text-text transition-opacity hover:opacity-60 focus:outline-none"
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

      {/* 사진 자세히 보기 — 그리드와 같은 원본(캐시됨). key 교체로 방향 애니 재생 */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-3 pb-[calc(1rem+var(--safe-bottom))]">
        {/* eslint-disable-next-line @next/next/no-img-element -- 라우트 서빙 이미지 */}
        <img
          key={photo.id}
          src={rawUrl(photo.id)}
          alt=""
          draggable={false}
          onClick={(e) => e.stopPropagation()}
          className={`max-h-full max-w-full rounded-lg object-contain ${
            closing ? "animate-modal-pop-out" : DETAIL_IMG_ANIM[dir]
          }`}
        />

        {/* 이전/다음 화살표 — 경계에선 숨김. 데스크톱·발견성 보조(모바일은 스와이프 주). */}
        {hasPrev && (
          <button
            type="button"
            aria-label="이전 사진"
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            className="absolute left-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black/70 shadow-md transition hover:bg-white hover:text-black focus:outline-none active:scale-90"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden width={26} height={26}>
              <path
                d="M15 6L9 12L15 18"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
        {hasNext && (
          <button
            type="button"
            aria-label="다음 사진"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className="absolute right-1 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black/70 shadow-md transition hover:bg-white hover:text-black focus:outline-none active:scale-90"
          >
            <svg viewBox="0 0 24 24" fill="none" aria-hidden width={26} height={26}>
              <path
                d="M9 6L15 12L9 18"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

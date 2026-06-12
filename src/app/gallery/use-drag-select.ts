"use client";

import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useGallerySelectionStore } from "@/lib/gallery-selection-store";

// 윈도우 탐색기식 사각형(고무줄) 드래그 선택.
// 선택 모드에서 그리드를 드래그하면 파란 사각형이 그려지고, 그 사각형에 겹치는 사진이
// 실시간으로 선택된다. 손가락이 위/아래 끝에 닿으면 자동 스크롤하며 박스가 계속 자란다.
// 임계치 미만(탭)은 드래그가 아니므로 onClick의 단일 토글이 그대로 동작한다.

type TileRect = { id: number; x: number; y: number; w: number; h: number };

const DRAG_THRESHOLD = 6; // 이만큼(px) 움직여야 탭이 아닌 드래그로 간주
const EDGE = 90; // 뷰포트 위/아래 이 영역(px)에 들어오면 자동 스크롤
const MAX_SCROLL_SPEED = 18; // 자동 스크롤 최대 속도(px/frame)

export function useDragSelect({
  selecting,
  containerRef,
  tiles,
}: {
  selecting: boolean;
  containerRef: RefObject<HTMLDivElement | null>;
  tiles: TileRect[];
}) {
  // 진행 상태(렌더와 무관 → 모두 ref)
  const startClient = useRef<{ x: number; y: number } | null>(null); // pointerdown 지점(뷰포트 좌표)
  const anchor = useRef({ x: 0, y: 0 }); // 박스 고정 꼭짓점(컨테이너 좌표 — 스크롤 불변)
  const base = useRef<Set<number>>(new Set()); // 드래그 시작 시점의 기존 선택(보존)
  const engaged = useRef(false); // 임계치를 넘겨 실제 사각형 드래그 중인지
  const suppressClick = useRef(false); // 드래그 직후 따라오는 click(토글) 무시
  const lastClient = useRef({ x: 0, y: 0 }); // 최신 포인터(자동 스크롤 중 박스 갱신용)

  // 최신 타일 사각형을 ref에 동기화(리스너 클로저가 항상 최신값을 읽도록)
  const tilesRef = useRef(tiles);
  useEffect(() => {
    tilesRef.current = tiles;
  });

  useEffect(() => {
    if (!selecting) return;
    const { setSelection } = useGallerySelectionStore.getState();
    let raf = 0;

    const root = document.documentElement;
    const lockOverscroll = () => {
      root.style.overscrollBehaviorY = "none";
    };
    const unlockOverscroll = () => {
      root.style.overscrollBehaviorY = "";
    };

    // iOS Safari는 overscroll-behavior를 무시 → 당겨서 새로고침을 막으려면 드래그 중
    // touchmove를 non-passive로 preventDefault 해야 한다(네이티브 스크롤/새로고침만 차단,
    // 우리 자동 스크롤은 scrollBy라 영향 없음). 그리드에서 누르는 동안에만 막는다.
    const onTouchMove = (e: TouchEvent) => {
      if (startClient.current && e.cancelable) e.preventDefault();
    };

    // 현재 포인터로 (보이지 않는) 선택 사각형을 계산해 겹치는 타일을 선택에 반영한다.
    const updateMarquee = (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      // 포인터를 컨테이너 좌표로 변환(스크롤하면 rect.top이 변해 사각형이 자란다)
      const curX = clientX - rect.left;
      const curY = clientY - rect.top;
      const x = Math.min(anchor.current.x, curX);
      const y = Math.min(anchor.current.y, curY);
      const w = Math.abs(curX - anchor.current.x);
      const h = Math.abs(curY - anchor.current.y);

      // 기존 선택 ∪ 사각형에 겹치는 타일 → 한 번에 교체(타일은 바뀐 것만 리렌더)
      const next = new Set(base.current);
      for (const t of tilesRef.current) {
        if (x < t.x + t.w && x + w > t.x && y < t.y + t.h && y + h > t.y)
          next.add(t.id);
      }
      setSelection(next);
    };

    // 끝 근처면 스크롤하며 박스를 계속 갱신하는 루프
    const tick = () => {
      const { x, y } = lastClient.current;
      const vh = window.innerHeight;
      let speed = 0;
      if (y < EDGE) speed = -MAX_SCROLL_SPEED * (1 - Math.max(0, y) / EDGE);
      else if (y > vh - EDGE)
        speed = MAX_SCROLL_SPEED * (1 - Math.max(0, vh - y) / EDGE);
      if (speed !== 0) {
        window.scrollBy(0, speed);
        updateMarquee(x, y);
      }
      raf = requestAnimationFrame(tick);
    };
    const startAutoScroll = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const stopAutoScroll = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };

    const onMove = (e: PointerEvent) => {
      if (!startClient.current) return;
      lastClient.current = { x: e.clientX, y: e.clientY };
      if (!engaged.current) {
        if (
          Math.hypot(
            e.clientX - startClient.current.x,
            e.clientY - startClient.current.y
          ) < DRAG_THRESHOLD
        )
          return;
        // 드래그 확정 — 시작점을 박스 고정 꼭짓점(컨테이너 좌표)으로 고정
        const container = containerRef.current;
        if (!container) return;
        const rect = container.getBoundingClientRect();
        anchor.current = {
          x: startClient.current.x - rect.left,
          y: startClient.current.y - rect.top,
        };
        base.current = new Set(
          useGallerySelectionStore.getState().selectedIds
        );
        engaged.current = true;
        suppressClick.current = true;
        lockOverscroll();
        startAutoScroll();
      }
      updateMarquee(e.clientX, e.clientY);
    };

    const onUp = () => {
      startClient.current = null;
      engaged.current = false;
      stopAutoScroll();
      unlockOverscroll();
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    // passive:false 여야 preventDefault가 적용된다(pull-to-refresh 차단)
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      stopAutoScroll();
      unlockOverscroll();
      startClient.current = null;
      engaged.current = false;
    };
  }, [selecting, containerRef]);

  return {
    // 그리드 컨테이너 onPointerDown에 연결 — 선택 모드에서만 드래그 시작점을 기록
    onPointerDown: (e: ReactPointerEvent) => {
      if (!selecting) return;
      startClient.current = { x: e.clientX, y: e.clientY };
      lastClient.current = { x: e.clientX, y: e.clientY };
      engaged.current = false;
      suppressClick.current = false; // 새 인터랙션 시작 → 묵은 억제 플래그 해제
    },
    // 타일 onClick에서 호출 — 직전이 사각형 드래그였으면 true(토글 건너뜀)
    shouldSuppressClick: () => {
      if (suppressClick.current) {
        suppressClick.current = false;
        return true;
      }
      return false;
    },
  };
}

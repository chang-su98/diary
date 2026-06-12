"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { usePullRefreshStore } from "@/lib/pull-refresh-store";

const TRIGGER = 70; // 새로고침 발동 거리(px)
const MAX_PULL = 110; // 최대 당김 거리
const RESISTANCE = 0.5; // 고무줄 저항 계수

// 터치 지점부터 body까지 올라가며, 스크롤된(맨 위가 아닌) 스크롤 컨테이너가 있으면 false.
// 내부 스크롤 영역(예: 캘린더)의 스크롤을 가로채지 않기 위함.
function scrollableAncestorAtTop(node: EventTarget | null): boolean {
  let el = node instanceof Element ? (node as HTMLElement) : null;
  while (el && el !== document.body && el !== document.documentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) {
      if (el.scrollTop > 0) return false;
    }
    el = el.parentElement;
  }
  return true;
}

/**
 * 당겨서 새로고침 + 앱 복귀 시 자동 갱신.
 * standalone PWA에는 브라우저의 pull-to-refresh가 없어 직접 구현한다.
 * 페이지 최상단(window.scrollY===0, 내부 스크롤도 맨 위)에서 수직으로 당길 때만 발동.
 */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [dragging, setDragging] = useState(false);

  const startY = useRef<number | null>(null);
  const startX = useRef(0);
  const active = useRef(false); // 당김 제스처 진행 중
  const distance = useRef(0); // 현재 당김 거리(최신값)
  const busy = useRef(false); // 새로고침 처리 중

  // 앱 복귀(탭 전환·화면 깨움) 시 자동 갱신
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  // 당겨서 새로고침 제스처 — 리스너는 1회만 등록(refs로 최신값 참조)
  useEffect(() => {
    function reset() {
      startY.current = null;
      active.current = false;
    }
    function onStart(e: TouchEvent) {
      // 선택 드래그 등으로 새로고침이 꺼져 있으면 제스처 자체를 시작하지 않는다
      if (!usePullRefreshStore.getState().enabled) return;
      if (window.scrollY > 0 || busy.current) return;
      if (!scrollableAncestorAtTop(e.target)) return;
      startY.current = e.touches[0]?.clientY ?? null;
      startX.current = e.touches[0]?.clientX ?? 0;
      active.current = false;
    }
    function onMove(e: TouchEvent) {
      if (startY.current === null || busy.current) return;
      const dy = (e.touches[0]?.clientY ?? 0) - startY.current;
      const dx = (e.touches[0]?.clientX ?? 0) - startX.current;
      // 아직 발동 전: 수직(아래 방향) 의도가 확실할 때만 시작 — 가로 스와이프 무시
      if (!active.current) {
        if (dy <= 0 || dy < Math.abs(dx)) return;
        active.current = true;
        setDragging(true);
      }
      if (window.scrollY > 0) return;
      const dist = Math.min(MAX_PULL, dy * RESISTANCE);
      distance.current = dist;
      setPull(dist);
      if (e.cancelable) e.preventDefault(); // iOS 고무줄 반동 억제
    }
    function onEnd() {
      if (!active.current) {
        reset();
        return;
      }
      reset();
      setDragging(false);
      if (distance.current >= TRIGGER) {
        busy.current = true;
        setRefreshing(true);
        setPull(TRIGGER);
        router.refresh();
        // router.refresh()는 완료 시점을 알려주지 않으므로 짧은 지연 후 해제
        window.setTimeout(() => {
          busy.current = false;
          distance.current = 0;
          setRefreshing(false);
          setPull(0);
        }, 700);
      } else {
        distance.current = 0;
        setPull(0);
      }
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("touchend", onEnd);
    window.addEventListener("touchcancel", onEnd);
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [router]);

  const progress = Math.min(1, pull / TRIGGER);

  return (
    <>
      {/* 당김 인디케이터 — 화면 최상단 고정 */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center"
        style={{
          transform: `translateY(${pull - 36}px)`,
          opacity: refreshing ? 1 : progress,
          transition: dragging ? "none" : "transform 0.25s, opacity 0.25s",
        }}
      >
        <span
          className={`mt-[calc(env(safe-area-inset-top)+0.5rem)] size-7 rounded-full border-2 border-line border-t-primary ${
            refreshing ? "animate-spin" : ""
          }`}
          style={
            refreshing ? undefined : { transform: `rotate(${progress * 270}deg)` }
          }
        />
      </div>

      {/* 콘텐츠 — 당기는 동안에만 transform 부여(평상시 transform:none → 내부 fixed 정상) */}
      <div
        style={{
          transform: pull ? `translateY(${pull}px)` : undefined,
          transition: dragging ? "none" : "transform 0.25s",
        }}
      >
        {children}
      </div>
    </>
  );
}

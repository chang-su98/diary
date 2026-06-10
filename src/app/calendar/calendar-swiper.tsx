"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * CSS scroll-snap 기반 좌우 스와이퍼. 슬라이드를 받아 가로 스냅으로 넘기고
 * 하단에 현재 위치 점(dots)을 표시한다. (라이브러리 미사용)
 */
export function CalendarSwiper({ slides }: { slides: ReactNode[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActive(idx); // 이벤트 핸들러 내 setState — 동일 값이면 React가 무시
  }

  function goTo(i: number) {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {slides.map((slide, i) => (
          <div
            key={i}
            className="h-full w-full shrink-0 snap-center overflow-y-auto px-8 pb-4"
          >
            {slide}
          </div>
        ))}
      </div>

      {/* 하단 고정 페이지 점 */}
      <div className="flex shrink-0 justify-center gap-2 pt-5 pb-2">
        {slides.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`${i + 1}번째 페이지로 이동`}
            aria-current={i === active ? "true" : undefined}
            onClick={() => goTo(i)}
            className={`size-1.5 rounded-full transition-colors ${
              i === active ? "bg-text" : "bg-line"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

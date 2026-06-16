"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * CSS scroll-snap 기반 좌우 스와이퍼. 슬라이드를 받아 가로 스냅으로 넘기고
 * 하단에 현재 위치 점(dots)을 표시한다. (라이브러리 미사용)
 *
 * jump: 외부에서 특정 슬라이드로 이동시키는 신호. nonce가 바뀔 때마다 index로 스크롤.
 */
export function CalendarSwiper({
  slides,
  jump,
}: {
  slides: ReactNode[];
  jump?: { index: number; nonce: number };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function onScroll() {
    const el = ref.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    setActive(idx); // 이벤트 핸들러 내 setState — 동일 값이면 React가 무시
  }

  // 외부 점프 신호 — nonce가 0보다 클 때(=실제 점프 발생)만 해당 슬라이드로 스크롤.
  const jumpNonce = jump?.nonce ?? 0;
  const jumpIndex = jump?.index ?? 0;
  useEffect(() => {
    if (jumpNonce <= 0) return;
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: jumpIndex * el.clientWidth, behavior: "smooth" });
  }, [jumpNonce, jumpIndex]);

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

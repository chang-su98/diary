"use client";

import { useEffect, useRef, type ReactNode } from "react";

// 스크롤로 뷰포트에 들어오면 fade-up(opacity+살짝 위로)으로 나타나는 섹션 래퍼.
// IntersectionObserver로 한 번만 트리거(클래스 토글) → React state 미사용(set-state-in-effect 무관).
// main의 `[&>section]` 레이아웃 규칙과 맞물리도록 <section>으로 렌더한다.
export function Reveal({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const show = () => el.classList.add("reveal-in");
    let pending: (() => void) | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        // 스플래시가 끝난 뒤에만 fade 시작(콜드스타트 첫 화면이 스플래시 뒤에서
        // 먼저 사라지는 것 방지). 이미 끝났으면 즉시.
        if (document.documentElement.classList.contains("splash-done")) show();
        else {
          pending = show;
          window.addEventListener("splash-done", show, { once: true });
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (pending) window.removeEventListener("splash-done", pending);
    };
  }, []);

  return (
    <section ref={ref} className={`reveal ${className ?? ""}`}>
      {children}
    </section>
  );
}

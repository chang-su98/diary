"use client";

import { useEffect, useRef, useState } from "react";

// 시작일(2026-03-30, KST)을 1일로 본다.
const START_MS = new Date("2026-03-30T00:00:00+09:00").getTime();
const DAY_MS = 86_400_000;

function computeDayCount() {
  return Math.max(1, Math.floor((Date.now() - START_MS) / DAY_MS) + 1);
}

/**
 * 진입 시 1 → 오늘까지의 누적 일수로 올라가는 카운트업 숫자.
 * setState는 rAF 콜백 안에서만 호출(렌더/이펙트 동기 호출 아님).
 */
export function DayCounter({ className }: { className?: string }) {
  const [count, setCount] = useState(1);
  const rafRef = useRef(0);

  useEffect(() => {
    const target = computeDayCount();
    // 모션 저감 설정 사용자는 duration 0 → 첫 프레임에 최종값으로 점프(애니메이션 없음)
    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const duration = reduced ? 0 : 1200; // ms
    let startTime: number | null = null;

    const tick = (now: number) => {
      if (startTime === null) startTime = now;
      const progress =
        duration === 0 ? 1 : Math.min((now - startTime) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setCount(Math.max(1, Math.round(eased * target)));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return <span className={className}>{count}</span>;
}

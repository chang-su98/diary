"use client";

import { useEffect, useRef, useState } from "react";

// 두 카운터가 동시에 끝나도록 공유하는 지속시간
const DURATION_MS = 1500;

// easeOutQuart — 끝에서 천천히 멈추는 감속 모션
function easeOutQuart(p: number): number {
  return 1 - Math.pow(1 - p, 4);
}

/**
 * 1 → target 으로 올라가는 카운트업 값.
 * getTarget은 모듈 레벨의 안정 함수여야 한다(렌더 중 시간 읽기 회피 + 1회 실행).
 * setState는 rAF 콜백 안에서만 호출.
 */
export function useCountUp(getTarget: () => number): number {
  const [value, setValue] = useState(1);
  const rafRef = useRef(0);

  useEffect(() => {
    const target = getTarget();
    const reduced =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const duration = reduced ? 0 : DURATION_MS;
    let startTime: number | null = null;

    const tick = (now: number) => {
      if (startTime === null) startTime = now;
      const p = duration === 0 ? 1 : Math.min((now - startTime) / duration, 1);
      setValue(Math.max(1, Math.round(easeOutQuart(p) * target)));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };

    const start = () => {
      rafRef.current = requestAnimationFrame(tick);
    };

    // 스플래시(콜드 스타트)가 끝난 뒤 카운트업 시작 — 스플래시 뒤에서 끝나버리지 않게.
    // 이미 끝났으면(클라이언트 내비게이션 등) 즉시 시작.
    let removeListener: (() => void) | undefined;
    if (document.documentElement.classList.contains("splash-done")) {
      start();
    } else {
      const onDone = () => start();
      window.addEventListener("splash-done", onDone, { once: true });
      removeListener = () => window.removeEventListener("splash-done", onDone);
    }

    return () => {
      cancelAnimationFrame(rafRef.current);
      removeListener?.();
    };
  }, [getTarget]);

  return value;
}

"use client";

import { useCountUp } from "./use-count-up";

// 시작일(2026-03-30, KST)을 1일로 본다.
const START_MS = new Date("2026-03-30T00:00:00+09:00").getTime();
const DAY_MS = 86_400_000;

function computeDayCount() {
  return Math.max(1, Math.floor((Date.now() - START_MS) / DAY_MS) + 1);
}

/** 진입 시 1 → 오늘까지의 누적 일수로 올라가는 카운트업 숫자. */
export function DayCounter({ className }: { className?: string }) {
  const count = useCountUp(computeDayCount);
  return <span className={className}>{count}</span>;
}

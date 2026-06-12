"use client";

import { daysSince } from "@/lib/relationship";
import { useCountUp } from "./use-count-up";

// 시작일(처음 만난 날)을 1일로 본 누적 일수 — 공유 상수(relationship)에서 계산.
function computeDayCount() {
  return daysSince();
}

/** 진입 시 1 → 오늘까지의 누적 일수로 올라가는 카운트업 숫자. */
export function DayCounter({ className }: { className?: string }) {
  const count = useCountUp(computeDayCount);
  return <span className={className}>{count}</span>;
}

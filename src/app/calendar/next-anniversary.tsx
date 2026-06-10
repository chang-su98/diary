"use client";

import { useState } from "react";
import { useCountUp } from "./use-count-up";

// 시작일 2026-03-30(1일째)의 다음 주년까지 남은 일수를 계산.
const START_YEAR = 2026;
const START_MONTH = 2; // 0-based: 3월
const START_DAY = 30;
const DAY_MS = 86_400_000;

function nextAnniversary() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // 올해 기념일이 이미 지났으면 내년으로
  let ann = new Date(today.getFullYear(), START_MONTH, START_DAY);
  if (ann.getTime() < today.getTime()) {
    ann = new Date(today.getFullYear() + 1, START_MONTH, START_DAY);
  }
  return {
    years: ann.getFullYear() - START_YEAR, // 몇 주년인지
    remaining: Math.round((ann.getTime() - today.getTime()) / DAY_MS),
  };
}

function computeRemaining() {
  return nextAnniversary().remaining;
}

export function NextAnniversary({ className }: { className?: string }) {
  // years와 D-DAY 판정용 최종값은 마운트 시 1회 고정(렌더 중 시간 읽기 회피)
  const [{ years, remaining }] = useState(nextAnniversary);
  // 남은 일수는 DayCounter와 동일 duration으로 카운트업 → 동시에 종료
  const animated = useCountUp(computeRemaining);

  return (
    <span className={className} suppressHydrationWarning>
      {years}년까지 {remaining === 0 ? "D-DAY" : `D-${animated}`}
    </span>
  );
}

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCalendarStore } from "@/lib/calendar-store";
import { fetchAnniversaries } from "@/lib/calendar-api";
import {
  DAY_MS,
  formatYmdWeekday,
  nextYearlyOccurrence,
  yearlyJumpDate,
} from "@/lib/calendar-date";

// 매년 반복 일정을 생일 D-day 목록 아래에 같은 스타일로 표시한다.
// 일정 쿼리(["anniversaries"])를 AnniversarySection과 공유 → 중복 fetch 없음.

// 저장된 날짜(UTC 자정 ISO)의 월/일로 다음 발생 시각(로컬 자정 ms) — D-day·정렬용
function nextOccurrenceMs(iso: string, todayMs: number): number {
  const d = new Date(iso);
  return nextYearlyOccurrence(
    d.getUTCMonth(),
    d.getUTCDate(),
    todayMs
  ).getTime();
}

export function YearlyAnniversaries() {
  // 오늘 0시(로컬)을 마운트 시 1회 고정 — 렌더 중 시간 읽기(purity 위반) 회피
  const [todayMs] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  });

  const jumpToDate = useCalendarStore((s) => s.jumpToDate);

  const { data } = useQuery({
    queryKey: ["anniversaries"],
    queryFn: fetchAnniversaries,
  });

  // 매년 반복만, 다음 주기 가까운 순. 없으면 아무것도 렌더하지 않는다.
  const items = (data ?? [])
    .filter((a) => a.yearly)
    .sort(
      (a, b) =>
        nextOccurrenceMs(a.date, todayMs) - nextOccurrenceMs(b.date, todayMs)
    );
  if (items.length === 0) return null;

  return (
    <ul className="flex flex-col">
      {items.map((a) => {
        const nextMs = nextOccurrenceMs(a.date, todayMs);
        const remaining = Math.round((nextMs - todayMs) / DAY_MS);
        return (
          <li key={a.id}>
            {/* 누르면 달력으로 넘어가 그 일정 날짜를 선택(같은 달이면 올해로 → 오늘과 함께 보임) */}
            <button
              type="button"
              onClick={() => {
                const ev = new Date(a.date);
                const t = yearlyJumpDate(
                  ev.getUTCMonth(),
                  ev.getUTCDate(),
                  todayMs
                );
                jumpToDate(t.y, t.m, t.d);
              }}
              className="flex w-full items-center justify-between gap-3 border-b border-line py-4 text-left transition-colors hover:bg-bg"
            >
              <div className="flex flex-col gap-1">
                <span className="text-xs tracking-[0.15em] text-text-muted">
                  {a.title}
                  {a.author
                    ? ` · ${a.author.displayName ?? a.author.username}`
                    : ""}
                </span>
                <span className="text-sm font-light tracking-wide">
                  {formatYmdWeekday(a.date)}
                </span>
              </div>
              <span className="text-2xl font-normal tabular-nums text-text">
                {remaining === 0 ? "D-DAY" : `D-${remaining}`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

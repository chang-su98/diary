"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCalendarStore } from "@/lib/calendar-store";
import { yearlyJumpDate } from "@/lib/calendar-date";

// 매년 반복 일정을 생일 D-day 목록 아래에 같은 스타일로 표시한다.
// 일정 쿼리(["anniversaries"])를 AnniversarySection과 공유 → 중복 fetch 없음.

type Anniversary = {
  id: number;
  title: string;
  date: string; // ISO 문자열(UTC 자정)
  yearly: boolean;
  author: { displayName: string | null; username: string } | null;
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const DAY_MS = 86_400_000;

async function fetchAnniversaries(): Promise<Anniversary[]> {
  const res = await fetch("/api/anniversaries");
  if (!res.ok) throw new Error("일정을 불러오지 못했습니다.");
  const data: { anniversaries: Anniversary[] } = await res.json();
  return data.anniversaries;
}

// 저장된 날짜(UTC 자정)에서 yyyy-mm-dd(요일) 표기
function formatDate(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}(${WEEKDAYS[d.getUTCDay()]})`;
}

// 다음 주기(올해 또는 내년) 발생 시각(로컬 자정 ms)
function nextOccurrenceMs(iso: string, todayMs: number): number {
  const d = new Date(iso);
  const today = new Date(todayMs);
  let next = new Date(today.getFullYear(), d.getUTCMonth(), d.getUTCDate());
  if (next.getTime() < todayMs) {
    next = new Date(today.getFullYear() + 1, d.getUTCMonth(), d.getUTCDate());
  }
  return next.getTime();
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
                  {formatDate(a.date)}
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

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCalendarStore } from "@/lib/calendar-store";
import { fetchMembers } from "@/lib/calendar-api";
import {
  DAY_MS,
  formatYmdWeekday,
  nextYearlyOccurrence,
  yearlyJumpDate,
} from "@/lib/calendar-date";

// 저장된 생일(UTC 자정)에서 월/일 추출 — 다음 생일까지 남은 일수(오늘 0시 기준).
function daysUntilBirthday(iso: string, todayMs: number): number {
  const bd = new Date(iso);
  const next = nextYearlyOccurrence(bd.getUTCMonth(), bd.getUTCDate(), todayMs);
  return Math.round((next.getTime() - todayMs) / DAY_MS);
}

export function BirthdayList() {
  // 오늘 0시(로컬)을 마운트 시 1회 고정 — 렌더 중 시간 읽기(purity 위반) 회피
  const [todayMs] = useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
  });

  const jumpToDate = useCalendarStore((s) => s.jumpToDate);

  const { data: members, isPending, isError } = useQuery({
    queryKey: ["members"],
    queryFn: fetchMembers,
  });

  if (isPending) {
    return <p className="py-6 text-center text-sm text-text-muted">불러오는 중…</p>;
  }
  if (isError || !members) {
    return (
      <p className="py-6 text-center text-sm text-text-muted">
        생일 정보를 불러오지 못했습니다.
      </p>
    );
  }

  return (
    <ul className="flex flex-col pt-2">
      {members.map((m) => {
        const name = m.displayName ?? m.username;
        const bday = m.birthday; // 클로저에서 narrowing 유지용
        const remaining =
          bday !== null ? daysUntilBirthday(bday, todayMs) : null;
        const inner = (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-xs tracking-[0.15em] text-text-muted">
                {name}님의 생일
              </span>
              <span className="text-sm font-light tracking-wide">
                {bday !== null ? formatYmdWeekday(bday) : "생일 미등록"}
              </span>
            </div>
            <span className="text-2xl font-normal tabular-nums text-text">
              {bday === null
                ? "--"
                : remaining === 0
                  ? "D-DAY"
                  : `D-${remaining}`}
            </span>
          </>
        );
        const rowClass =
          "flex w-full items-center justify-between gap-3 border-b border-line py-4 text-left";
        return (
          <li key={m.id}>
            {bday !== null ? (
              // 누르면 달력으로 넘어가 생일 날짜를 선택(같은 달이면 올해로 → 오늘과 함께 보임)
              <button
                type="button"
                onClick={() => {
                  const b = new Date(bday);
                  const t = yearlyJumpDate(
                    b.getUTCMonth(),
                    b.getUTCDate(),
                    todayMs
                  );
                  jumpToDate(t.y, t.m, t.d);
                }}
                className={`${rowClass} transition-colors hover:bg-bg`}
              >
                {inner}
              </button>
            ) : (
              <div className={rowClass}>{inner}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCalendarStore } from "@/lib/calendar-store";

type Member = {
  id: number;
  username: string;
  displayName: string | null;
  birthday: string | null; // ISO 문자열 또는 null
};

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
const DAY_MS = 86_400_000;

async function fetchMembers(): Promise<Member[]> {
  const res = await fetch("/api/members");
  if (!res.ok) throw new Error("회원 정보를 불러오지 못했습니다.");
  const data: { members: Member[] } = await res.json();
  return data.members;
}

// 저장된 생일(UTC 자정)에서 yyyy-mm-dd(요일) 표기
function formatBirthday(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}(${WEEKDAYS[d.getUTCDay()]})`;
}

// 다음 생일 발생일(로컬). 오늘이 생일이면 오늘. (D-day·달력 점프 공용)
function nextBirthday(iso: string, todayMs: number): Date {
  const bd = new Date(iso);
  const month = bd.getUTCMonth();
  const day = bd.getUTCDate();
  const today = new Date(todayMs);
  let next = new Date(today.getFullYear(), month, day);
  if (next.getTime() < todayMs) {
    next = new Date(today.getFullYear() + 1, month, day);
  }
  return next;
}

// 다음 생일까지 남은 일수(오늘 0시 기준). 오늘이 생일이면 0.
function daysUntilBirthday(iso: string, todayMs: number): number {
  return Math.round((nextBirthday(iso, todayMs).getTime() - todayMs) / DAY_MS);
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
                {bday !== null ? formatBirthday(bday) : "생일 미등록"}
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
              // 누르면 달력으로 넘어가 다음 생일 날짜를 선택
              <button
                type="button"
                onClick={() => {
                  const d = nextBirthday(bday, todayMs);
                  jumpToDate(d.getFullYear(), d.getMonth(), d.getDate());
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

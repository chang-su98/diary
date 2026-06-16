"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAnniversaries, fetchMembers } from "@/lib/calendar-api";
import { buildFixedAnniversaries } from "@/lib/fixed-anniversaries";
import {
  dayInMonth,
  formatDday,
  localMs,
  occursInMonth,
  ymdFromIso,
} from "@/lib/calendar-date";
import { holidayKey, useHolidays } from "@/lib/use-holidays";

// 메인 view 캘린더 — 이번 달 그리드에 일정(생일·기념일) 마커 + 오늘 강조. 날짜를 누르면
// 그날 일정만, 안 누르면 이번 달 전체 일정을 아래 리스트에 보여준다(읽기 전용).
// "전체 ›"로 캘린더(D-day) 페이지 이동. 일정/회원 쿼리는 캘린더 페이지와 캐시 공유.

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const KO_WD = ["일", "월", "화", "수", "목", "금", "토"] as const;
const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
] as const;
const RANGE_GUARD = 800; // 기간 일정 순회 폭주 가드(~2년)

export function HomeCalendar() {
  // 오늘(로컬 자정) 1회 고정 — 렌더 중 시간 읽기(purity 위반) 회피
  const [today] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() };
  });
  // 선택한 '일'(이번 달 한정). null이면 이번 달 전체 리스트.
  const [selected, setSelected] = useState<number | null>(null);

  const { data: anniversaries } = useQuery({
    queryKey: ["anniversaries"],
    queryFn: fetchAnniversaries,
  });
  const { data: members } = useQuery({
    queryKey: ["members"],
    queryFn: fetchMembers,
  });
  // 공휴일(천문연 API) — 이번 달이 속한 연도. 미로딩 시 빈 맵(일요일은 그래도 빨강).
  const holidays = useHolidays(today.y);

  // 데이터 로드 전엔 자리만 확보 — 그리드(오늘 의존)를 SSR에 넣지 않아 하이드레이션 안전.
  if (!anniversaries || !members) {
    return <div className="h-[320px]" aria-hidden />;
  }

  // DB 일정 + 고정(생일·처음 만난 날) 가상 일정
  const all = [...anniversaries, ...buildFixedAnniversaries(members)];
  const todayMs = new Date(today.y, today.m, today.d).getTime();

  // 이번 달에 일정이 있는 날 집합(마커용)
  const marks = new Set<number>();
  for (const a of all) {
    const d = new Date(a.date);
    const sy = d.getUTCFullYear();
    const sm = d.getUTCMonth();
    const sd = d.getUTCDate();
    if (a.yearly) {
      if (sm === today.m) marks.add(sd); // 매년 반복은 매년 그 월/일
    } else if (!a.endDate) {
      if (sy === today.y && sm === today.m) marks.add(sd);
    } else {
      const e = new Date(a.endDate);
      const end = new Date(
        e.getUTCFullYear(),
        e.getUTCMonth(),
        e.getUTCDate()
      ).getTime();
      const cur = new Date(sy, sm, sd);
      let guard = 0;
      while (cur.getTime() <= end && guard < RANGE_GUARD) {
        if (cur.getFullYear() === today.y && cur.getMonth() === today.m)
          marks.add(cur.getDate());
        cur.setDate(cur.getDate() + 1);
        guard++;
      }
    }
  }

  // 앞쪽 공백(첫날 요일까지) + 1..말일
  const firstWeekday = new Date(today.y, today.m, 1).getDay();
  const daysInMonth = new Date(today.y, today.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // 리스트: 선택일이면 그날 일정(지난·매년 포함), 아니면 이번 달 전체(일자 오름차순)
  const listItems =
    selected !== null
      ? all.filter((a) => {
          const s = ymdFromIso(a.date);
          if (a.yearly) return s.m === today.m && s.d === selected;
          const selMs = new Date(today.y, today.m, selected).getTime();
          const startMs = localMs(a.date);
          const endMs = a.endDate ? localMs(a.endDate) : startMs;
          return selMs >= startMs && selMs <= endMs; // 기간이면 그 사이 날짜 포함
        })
      : all
          .filter((a) =>
            occursInMonth(a.date, a.endDate, a.yearly, today.y, today.m)
          )
          .sort(
            (a, b) =>
              dayInMonth(a.date, today.y, today.m) -
              dayInMonth(b.date, today.y, today.m)
          );

  const selectedWd =
    selected !== null
      ? KO_WD[new Date(today.y, today.m, selected).getDay()]
      : null;
  // 선택(날짜/전체)이 바뀌면 key가 바뀌어 리스트 영역이 재마운트 → 페이드 인 재생
  const listKey = selected === null ? "all" : String(selected);
  // 선택한 날짜가 공휴일이면 이름 표시(예: "추석")
  const selectedHoliday =
    selected !== null
      ? holidays[holidayKey(today.y, today.m, selected)] ?? null
      : null;

  return (
    <div className="px-1">
      <p className="mb-3.5 text-center text-[0.85rem] tracking-[0.28em] text-text">
        {today.y} · {MONTHS[today.m]}
      </p>
      <div className="grid grid-cols-7 gap-y-2.5">
        {WEEKDAYS.map((d, i) => (
          <span
            key={`wd-${i}`}
            className={`text-center text-[0.65rem] tracking-wide ${
              i === 0 ? "text-error/80" : "text-text-muted"
            }`}
          >
            {d}
          </span>
        ))}
        {cells.map((n, i) => {
          if (n === null) return <span key={`e-${i}`} />;
          const isToday = n === today.d;
          const isSelected = n === selected;
          // 일요일 또는 공휴일이면 빨간 숫자
          const isRed =
            i % 7 === 0 || holidays[holidayKey(today.y, today.m, n)] != null;
          const marked = marks.has(n);
          return (
            <button
              key={n}
              type="button"
              onClick={() => setSelected((cur) => (cur === n ? null : n))}
              className="relative flex h-7 items-center justify-center text-[0.85rem] leading-none"
            >
              {isSelected ? (
                <span className="flex size-7 items-center justify-center rounded-full bg-primary font-medium text-bg">
                  {n}
                </span>
              ) : isToday ? (
                <span
                  className={`flex size-7 items-center justify-center rounded-full bg-line font-medium ${
                    isRed ? "text-error" : "text-text"
                  }`}
                >
                  {n}
                </span>
              ) : (
                <span className={isRed ? "text-error" : "text-text"}>{n}</span>
              )}
              {marked && !isSelected && !isToday && (
                <span className="absolute bottom-0 size-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      <div key={listKey} className="animate-list-fade">
        {/* 리스트 헤더 — 선택일 표기 + (전체 캘린더 이동 / 선택 해제) */}
        <div className="mb-1 mt-5 flex items-center justify-between border-t border-line pt-4">
          <span className="text-xs tracking-[0.15em] text-text-muted">
            {selected !== null ? (
              <>
                {today.m + 1}월 {selected}일 ({selectedWd})
                {selectedHoliday ? (
                  <span className="text-error"> · {selectedHoliday}</span>
                ) : null}
              </>
            ) : (
              `${today.m + 1}월 일정`
            )}
          </span>
          {selected !== null ? (
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-xs tracking-[0.15em] text-text-muted transition-colors hover:text-text"
            >
              이번 달
            </button>
          ) : (
            <Link
              href="/calendar"
              className="text-xs tracking-[0.15em] text-text-muted transition-colors hover:text-text"
            >
              전체 ›
            </Link>
          )}
        </div>

        {listItems.length > 0 ? (
          <ul className="flex flex-col">
            {listItems.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-[0.8rem] tracking-wide text-text">
                    {a.title}
                    {a.yearly ? " · 매년" : ""}
                  </span>
                  {selected === null && (
                    <span className="text-[0.65rem] tracking-[0.1em] text-text-muted">
                      {today.m + 1}월 {dayInMonth(a.date, today.y, today.m)}일
                    </span>
                  )}
                </div>
                <span className="shrink-0 text-sm font-normal tabular-nums text-text-muted">
                  {formatDday(a.date, a.yearly, todayMs)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-5 text-center text-xs tracking-[0.15em] text-text-muted">
            {selected !== null ? "이 날 일정이 없어요." : "이번 달 일정이 없어요."}
          </p>
        )}
      </div>
    </div>
  );
}

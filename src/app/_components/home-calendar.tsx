"use client";

import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAnniversaries, fetchMembers } from "@/lib/calendar-api";
import {
  buildFixedAnniversaries,
  type CalendarAnniversary,
  type FixedMember,
} from "@/lib/fixed-anniversaries";
import {
  dayInMonth,
  formatDday,
  markedDaysInMonth,
  monthListItems,
  selectDayItems,
} from "@/lib/calendar-date";
import { holidayKey, useHolidays } from "@/lib/use-holidays";

// 메인 view 캘린더 — 이번 달 그리드에 일정(생일·기념일) 마커 + 오늘 강조. 날짜를 누르면
// 그날 일정만, 안 누르면 이번 달 전체 일정을 아래 리스트에 보여준다(읽기 전용).
// "전체 ›"로 캘린더(D-day) 페이지 이동. 일정/회원 쿼리는 캘린더 페이지와 캐시 공유.
// 마커/리스트 계산은 calendar-date의 공용 함수 사용(D-day 페이지와 동일 로직).

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const KO_WD = ["일", "월", "화", "수", "목", "금", "토"] as const;
const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
] as const;

// 클라이언트 마운트 후에만 true — SSR/하이드레이션 첫 렌더에선 false.
// 그리드는 today(서버 UTC vs 클라 KST) 의존이라 SSR하면 불일치 → 클라에서만 렌더.
const subscribeNoop = () => () => {};

export function HomeCalendar({
  initialAnniversaries,
  initialMembers,
}: {
  initialAnniversaries: CalendarAnniversary[];
  initialMembers: FixedMember[];
}) {
  // 오늘(로컬 자정) 1회 고정 — 렌더 중 시간 읽기(purity 위반) 회피.
  // (탭을 열어둔 채 자정을 넘기면 어제로 고정되나, 캘린더 전반의 의도된 트레이드오프)
  const [today] = useState(() => {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth(), d: n.getDate() };
  });
  // 선택한 '일'(이번 달 한정). null이면 이번 달 전체 리스트.
  const [selected, setSelected] = useState<number | null>(null);
  // 클라이언트 여부 — useSyncExternalStore로 하이드레이션 안전하게 감지(setState-in-effect 회피)
  const isClient = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );

  // 서버에서 받은 데이터를 initialData로 — 클라이언트 fetch 왕복 없이 즉시 사용.
  // (변경 시 mutation이 invalidate하고, staleTime 내엔 재요청 안 함)
  const { data: anniversaries } = useQuery({
    queryKey: ["anniversaries"],
    queryFn: fetchAnniversaries,
    initialData: initialAnniversaries,
  });
  const { data: members } = useQuery({
    queryKey: ["members"],
    queryFn: fetchMembers,
    initialData: initialMembers,
  });
  // 공휴일(천문연 API) — 이번 달이 속한 연도. 미로딩 시 빈 맵(일요일은 그래도 빨강).
  const holidays = useHolidays(today.y);

  // 그리드는 클라이언트에서만 렌더(today 하이드레이션 불일치 회피). 데이터는 이미
  // initialData로 있어 클라 첫 렌더에서 바로 그려진다(네트워크 대기 없음).
  if (!isClient) {
    return <div className="min-h-[260px]" aria-hidden />;
  }

  // DB 일정 + 고정(생일·처음 만난 날) 가상 일정
  const all = [...anniversaries, ...buildFixedAnniversaries(members)];
  const todayMs = new Date(today.y, today.m, today.d).getTime();

  // 이번 달 마커 집합 + 그리드 셀(앞 빈칸 + 1..말일)
  const marks = markedDaysInMonth(all, today.y, today.m);
  const firstWeekday = new Date(today.y, today.m, 1).getDay();
  const daysInMonth = new Date(today.y, today.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  // 리스트: 선택일이면 그날 일정(지난·매년 포함), 아니면 이번 달 전체(일자 오름차순)
  const listItems =
    selected !== null
      ? selectDayItems(all, today.y, today.m, selected)
      : monthListItems(all, today.y, today.m);

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
                className="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0 last:pb-0"
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
          <p className="pt-5 text-center text-xs tracking-[0.15em] text-text-muted">
            {selected !== null ? "이 날 일정이 없어요." : "이번 달 일정이 없어요."}
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCalendarStore } from "@/lib/calendar-store";
import { AnniversarySection } from "./anniversary-section";
import { BirthdayList } from "./birthday-list";
import { CalendarSwiper } from "./calendar-swiper";
import { DayCounter } from "./day-counter";
import { NextAnniversary } from "./next-anniversary";
import { TripList } from "./trip-list";
import { YearlyAnniversaries } from "./yearly-anniversaries";

// 달력 화면 조립 + 슬라이드 점프 신호 중계.
// 슬라이드1의 생일·기념일 항목을 누르면 스토어 nonce가 바뀌고, 그 신호로
// 스와이퍼를 달력(슬라이드2)으로 이동시킨다(날짜 선택은 AnniversarySection이 처리).
export function CalendarView() {
  const nonce = useCalendarStore((s) => s.nonce);

  // 슬라이드 1: 누적 일수 + 회원 생일 / 슬라이드 2: 일정
  const slides = [
    <div key="overview">
      <section className="flex flex-col items-center gap-2 border-b border-line pb-10 ">
        <span className="text-[0.7rem] tracking-[0.3em] text-text-muted">
          SINCE 2026.03.30
        </span>
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-4xl font-thin text-text-muted">+</span>
          <DayCounter className="inline-block min-w-[2ch] text-center text-7xl font-extralight leading-none tabular-nums" />
          <span className="self-end pb-1 text-xl font-light text-text-muted">일</span>
        </div>
        <NextAnniversary className="text-[0.7rem] tracking-[0.3em] text-text-muted" />
      </section>
      <BirthdayList />
      {/* 매년 반복 일정도 생일과 같은 연례 D-day라 그 아래에 이어서 표시 */}
      <YearlyAnniversaries />
      {/* D-day 목록 아래 — 여행 계획(일차별 장소는 상세 페이지에서 관리) */}
      <TripList />
    </div>,
    <AnniversarySection key="schedule" />,
  ];

  return (
    <main className="mx-auto flex h-dvh w-full max-w-md flex-col pt-[calc(2rem+var(--safe-top))] pb-[calc(3.5rem+var(--safe-bottom))]">
      <CalendarSwiper slides={slides} jump={{ index: 1, nonce }} />
    </main>
  );
}

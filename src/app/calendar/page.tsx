import { DayCounter } from "./day-counter";

export default function CalendarPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-8 pb-28 pt-14">
      {/* 상단 누적 일수 — 2026.03.30을 1일로 카운트업 */}
      <section className="flex flex-col items-center gap-2 border-b border-line pb-10 pt-4">
        <span className="text-[0.7rem] tracking-[0.3em] text-text-muted">
          SINCE 2026.03.30
        </span>
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-4xl font-thin text-text-muted">+</span>
          <DayCounter className="inline-block min-w-[2ch] text-center text-7xl font-extralight leading-none tabular-nums" />
          <span className="self-end pb-1 text-xl font-light text-text-muted">일</span>
        </div>
      </section>

      {/* 캘린더 본문 (준비 중) */}
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-center">
        <h1 className="text-xl font-light tracking-[0.2em]">CALENDAR</h1>
        <p className="text-sm tracking-wide text-text-muted">준비 중</p>
      </div>
    </main>
  );
}

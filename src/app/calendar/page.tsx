import { BirthdayList } from "./birthday-list";
import { DayCounter } from "./day-counter";
import { NextAnniversary } from "./next-anniversary";

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
        <NextAnniversary className="text-[0.7rem] tracking-[0.3em] text-text-muted" />
      </section>

      {/* 회원 생일 목록 */}
      <BirthdayList />

      {/* 우리들의 기념일 — 추가 버튼(동작 연결 예정) */}
      <button
        type="button"
        className="mt-8 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-4 text-sm tracking-wide text-text-muted transition-colors hover:border-text hover:text-text active:scale-[0.99]"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          width={18}
          height={18}
          className="size-[18px] shrink-0"
        >
          <path
            d="M12 5V19M5 12H19"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
        기념일 추가하기
      </button>
    </main>
  );
}

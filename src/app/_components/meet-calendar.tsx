import { SINCE } from "@/lib/relationship";

// 처음 만난 달의 월 달력 — 만난 날(SINCE.day)에 동그라미 강조.
// 상수만 의존하는 정적 컴포넌트(서버 렌더, 시간/난수 없음 → 하이드레이션 안전).
const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const MONTHS = [
  "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
  "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER",
] as const;

export function MeetCalendar() {
  const { year, month, day } = SINCE; // month: 1-based
  const firstWeekday = new Date(year, month - 1, 1).getDay(); // 0=일
  const daysInMonth = new Date(year, month, 0).getDate();
  // 앞쪽 공백(첫날 요일까지) + 1..말일
  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className="px-1">
      <p className="mb-3.5 text-center text-[0.85rem] tracking-[0.28em] text-text">
        {year} · {MONTHS[month - 1]}
      </p>
      <div className="grid grid-cols-7 gap-y-2.5">
        {WEEKDAYS.map((d, i) => (
          <span
            key={`wd-${i}`}
            className={`text-center text-[0.65rem] tracking-wide ${
              i === 0 ? "text-text-muted/60" : "text-text-muted"
            }`}
          >
            {d}
          </span>
        ))}
        {cells.map((n, i) => {
          if (n === null) return <span key={`e-${i}`} />;
          const isMeet = n === day;
          const isSunday = i % 7 === 0;
          return (
            <span
              key={n}
              className="flex h-7 items-center justify-center text-[0.85rem] leading-none"
            >
              {isMeet ? (
                <span className="flex size-7 items-center justify-center rounded-full bg-primary font-medium text-bg">
                  {n}
                </span>
              ) : (
                <span className={isSunday ? "text-text-muted/50" : "text-text"}>
                  {n}
                </span>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

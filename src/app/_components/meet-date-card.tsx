import { SINCE } from "@/lib/relationship";

// 처음 만난 날 — 달력 그리드 대신 큰 날짜 카드(메인 view 캘린더와 시각적 중복 회피).
// SINCE 상수만 의존하는 정적 컴포넌트(서버 렌더, 시간/난수 없음 → 하이드레이션 안전).
const WEEKDAYS_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;
const pad = (n: number) => String(n).padStart(2, "0");

export function MeetDateCard({ days }: { days: number }) {
  const { year, month, day } = SINCE; // month: 1-based
  // 고정 날짜라 요일은 결정적(타임존 무관) — new Date(y, m-1, d)로 계산
  const weekday = WEEKDAYS_KO[new Date(year, month - 1, day).getDay()];

  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[0.6rem] tracking-[0.4em] text-text-muted">SINCE</span>
      <span className="text-[2.5rem] font-extralight leading-none tracking-[0.06em] tabular-nums text-text">
        {year}.{pad(month)}.{pad(day)}
      </span>
      <span className="text-[0.72rem] tracking-[0.3em] text-text-muted">
        {weekday}요일
      </span>
      <span className="mt-3 text-[0.7rem] tracking-[0.26em] text-text-muted">
        함께한 지 {days}일
      </span>
    </div>
  );
}

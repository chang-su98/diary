// 처음 만난 날 = 함께한 첫날(1일째). KST 기준 단일 출처.
// day-counter·next-anniversary·메인(MeetCalendar)이 모두 이 상수를 공유한다.
export const SINCE = { year: 2026, month: 3, day: 30 } as const; // month: 1-based

// 시작일(KST 자정)의 절대 ms. (모듈 로드 시 1회 계산되는 상수)
export const SINCE_MS = new Date(
  `${SINCE.year}-${String(SINCE.month).padStart(2, "0")}-${String(
    SINCE.day
  ).padStart(2, "0")}T00:00:00+09:00`
).getTime();

const DAY_MS = 86_400_000;

// 함께한 누적 일수(시작일을 1일째로). 호출 시점 기준.
export function daysSince(now: number = Date.now()): number {
  return Math.max(1, Math.floor((now - SINCE_MS) / DAY_MS) + 1);
}

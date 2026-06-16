// 처음 만난 날 = 함께한 첫날(1일째). KST 기준 단일 출처.
// day-counter·next-anniversary·메인(MeetCalendar)이 모두 이 상수를 공유한다.
//
// ⚠️ 타임존: 이 앱은 KST(국내 2인 폐쇄형) 전용이다. SINCE_MS는 KST(+09:00) 자정으로
// 고정하고, 캘린더의 "오늘"·D-day는 클라이언트 로컬 자정을 쓴다. KST 클라이언트에서는
// 일관되나 음수 오프셋 타임존에서 접속하면 누적일/D-day가 하루 어긋날 수 있다(의도된
// 단일 타임존 가정). 캘린더 날짜 유틸의 동일 주석: src/lib/calendar-date.ts 참조.
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

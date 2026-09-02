// 여행 일차(N일차) 파생 유틸 — 일차는 DB에 따로 두지 않고 Trip.startDate~endDate에서
// 계산한다. 서버(Zod 검증·API 가드)와 클라이언트(렌더)가 이 파일을 공유해
// 일차 계산이 두 곳으로 갈라지지 않게 한다.
//
// ⚠️ 날짜는 UTC 자정으로 저장/비교한다(calendar-date와 동일 규약).
// 입력은 "YYYY-MM-DD"(폼·API 페이로드) 또는 ISO 문자열(DB 직렬화) 둘 다 허용.

const DAY_MS = 86_400_000;

// 여행 기간 상한. 잘못된 값으로 수천 개 일차가 렌더되는 것을 막는 가드.
export const TRIP_MAX_DAYS = 60;

// "YYYY-MM-DD" | ISO → UTC 자정 ms. 파싱 실패 시 NaN.
function utcMs(value: string): number {
  return Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
}

// 총 일수(당일치기 = 1). 파싱 실패·역전이면 0 → 호출부가 "유효하지 않음"으로 처리.
export function tripDayCount(start: string, end: string): number {
  const s = utcMs(start);
  const e = utcMs(end);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.floor((e - s) / DAY_MS) + 1;
}

// N일차(1-based)의 실제 날짜 — UTC 자정 ISO 문자열.
export function tripDayIso(start: string, day: number): string {
  const d = new Date(utcMs(start));
  d.setUTCDate(d.getUTCDate() + day - 1);
  return d.toISOString();
}

// "N박 N+1일" — 당일치기는 "당일치기".
export function nightsLabel(start: string, end: string): string {
  const days = tripDayCount(start, end);
  return days <= 1 ? "당일치기" : `${days - 1}박 ${days}일`;
}

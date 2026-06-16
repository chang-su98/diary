// 캘린더 공용 날짜 유틸/상수.
//
// ⚠️ 타임존 가정: 이 앱은 KST(한국, 2인 폐쇄형) 전용이다. 날짜는 DB에 UTC 자정으로
// 저장되고(getUTC* 로 "달력 날짜"를 추출), "오늘"·D-day는 클라이언트 로컬 자정 기준으로
// 계산한다. 처음 만난 날 기준(relationship.SINCE_MS)도 KST(+09:00) 고정이다.
// → KST 클라이언트에서는 모두 일관되며, 음수 오프셋 타임존에서 접속하면 누적일/D-day가
//   하루 어긋날 수 있으나 운영 대상(국내 2인)이 KST라 의도된 단일 타임존 가정이다.

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;
export const DAY_MS = 86_400_000;

// 저장된 날짜(UTC 자정 ISO)에서 "yyyy-mm-dd(요일)" 표기
export function formatYmdWeekday(iso: string): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}(${WEEKDAYS[d.getUTCDay()]})`;
}

// 다음 연례 발생일(로컬 자정). 올해 남았으면 올해, 지났으면 내년. 오늘이면 오늘.
// D-day·정렬용. (점프 대상 선택은 yearlyJumpDate 참조 — 규칙이 다름)
export function nextYearlyOccurrence(
  month: number, // 0-based
  day: number,
  todayMs: number
): Date {
  const today = new Date(todayMs);
  let next = new Date(today.getFullYear(), month, day);
  if (next.getTime() < todayMs) {
    next = new Date(today.getFullYear() + 1, month, day);
  }
  return next;
}

// 매년 반복 일정(생일·기념일)을 슬라이드1에서 눌러 달력으로 점프할 때 선택할 날짜.
//
// - 같은 달이면 "올해" 날짜로(이미 지난 날이어도) → 오늘과 같은 달에 함께 보이게 한다.
//   (예: 오늘 6/16에 6/15 일정을 누르면 다음 발생인 내년 6월이 아니라 올해 6월로 가
//    오늘 6/16 표시가 그대로 보인다.)
// - 다른 달이면 다음 발생일(올해 남았으면 올해, 지났으면 내년).
export function yearlyJumpDate(
  month: number, // 0-based
  day: number,
  todayMs: number
): { y: number; m: number; d: number } {
  const today = new Date(todayMs);
  const ty = today.getFullYear();
  if (month === today.getMonth()) {
    return { y: ty, m: month, d: day };
  }
  const occ = new Date(ty, month, day);
  const y = occ.getTime() < todayMs ? ty + 1 : ty;
  return { y, m: month, d: day };
}

// UTC 자정으로 저장된 날짜에서 연/월/일 추출(타임존 시프트 방지)
export function ymdFromIso(iso: string): { y: number; m: number; d: number } {
  const dt = new Date(iso);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() };
}

// 로컬 자정 ms — UTC 저장 날짜의 연/월/일을 로컬 날짜로 취급(비교·계산용)
export function localMs(iso: string): number {
  const { y, m, d } = ymdFromIso(iso);
  return new Date(y, m, d).getTime();
}

// 표시 중인 달(y,m)에 발생하는 일정인지 — 매년 반복은 월 일치, 1회성은 그 연·월,
// 기간은 달과 겹치면 포함.
export function occursInMonth(
  iso: string,
  endIso: string | null,
  yearly: boolean,
  y: number,
  m: number
): boolean {
  const s = ymdFromIso(iso);
  if (yearly) return s.m === m;
  if (!endIso) return s.y === y && s.m === m;
  const monthStart = new Date(y, m, 1).getTime();
  const monthEnd = new Date(y, m + 1, 0).getTime();
  return localMs(iso) <= monthEnd && localMs(endIso) >= monthStart;
}

// 그 달 안에서의 정렬용 일자 — 기간이 이전 달부터 이어진 경우엔 1일로.
export function dayInMonth(iso: string, y: number, m: number): number {
  const s = ymdFromIso(iso);
  if (s.m === m && s.y === y) return s.d; // 그달 시작(단일/기간)
  if (s.m === m) return s.d; // 매년 반복(연도는 달라도 월 일치)
  return 1; // 이전 달부터 이어진 기간
}

// D-day 문자열 — 매년 반복이면 다음 주기까지, 1회성이면 지난 경우 D+N
export function formatDday(
  iso: string,
  yearly: boolean,
  todayMs: number
): string {
  const d = new Date(iso);
  const month = d.getUTCMonth();
  const day = d.getUTCDate();

  if (yearly) {
    const next = nextYearlyOccurrence(month, day, todayMs).getTime();
    const r = Math.round((next - todayMs) / DAY_MS);
    return r === 0 ? "D-DAY" : `D-${r}`;
  }

  const target = new Date(d.getUTCFullYear(), month, day);
  const r = Math.round((target.getTime() - todayMs) / DAY_MS);
  if (r === 0) return "D-DAY";
  return r > 0 ? `D-${r}` : `D+${-r}`;
}

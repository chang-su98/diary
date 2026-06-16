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

// 달 계산에 필요한 일정의 최소 형태(달력·메인 캘린더 공용).
// id는 정렬 2차 키용 — 가상(고정) 일정은 음수 id라 같은 날이면 뒤로 보낸다.
type OccurrenceLike = {
  id: number;
  date: string;
  endDate: string | null;
  yearly: boolean;
};

// 기간 일정 일자 순회 폭주 가드(~5.5년) — 비정상 데이터 방어. 단일 정의.
const RANGE_GUARD = 2000;

// 표시 중인 달(y,m)에 일정이 있는 '일' 집합(달력 마커용). 매년 반복은 그 월/일,
// 1회성은 해당 연·월, 기간은 시작~종료 중 그 달에 속하는 각 날(setDate 순회로 DST 보정).
export function markedDaysInMonth(
  list: OccurrenceLike[],
  y: number,
  m: number
): Set<number> {
  const marks = new Set<number>();
  for (const a of list) {
    const s = ymdFromIso(a.date);
    if (a.yearly) {
      if (s.m === m) marks.add(s.d);
    } else if (!a.endDate) {
      if (s.y === y && s.m === m) marks.add(s.d);
    } else {
      const end = localMs(a.endDate);
      const dt = new Date(localMs(a.date));
      let guard = 0;
      while (dt.getTime() <= end && guard < RANGE_GUARD) {
        if (dt.getFullYear() === y && dt.getMonth() === m) marks.add(dt.getDate());
        dt.setDate(dt.getDate() + 1);
        guard++;
      }
    }
  }
  return marks;
}

// 표시 중인 달(y,m)에 발생하는 일정만, 그 달 안 일자 오름차순. (날짜 미선택 리스트)
export function monthListItems<T extends OccurrenceLike>(
  list: T[],
  y: number,
  m: number
): T[] {
  return list
    .filter((a) => occursInMonth(a.date, a.endDate, a.yearly, y, m))
    .sort((a, b) => {
      const byDay = dayInMonth(a.date, y, m) - dayInMonth(b.date, y, m);
      if (byDay !== 0) return byDay;
      // 같은 날: 사용자 일정(양수 id) 먼저, 고정 가상 일정(음수 id) 뒤 → 결정적 순서
      const av = a.id < 0 ? 1 : 0;
      const bv = b.id < 0 ? 1 : 0;
      return av - bv || a.id - b.id;
    });
}

// 특정 날짜(y,m,d)의 일정 — 매년 반복은 월/일 일치, 1회성/기간은 그 날 포함. (날짜 선택 리스트)
export function selectDayItems<T extends OccurrenceLike>(
  list: T[],
  y: number,
  m: number,
  d: number
): T[] {
  const selMs = new Date(y, m, d).getTime();
  return list.filter((a) => {
    const s = ymdFromIso(a.date);
    if (a.yearly) return s.m === m && s.d === d;
    const startMs = localMs(a.date);
    const endMs = a.endDate ? localMs(a.endDate) : startMs;
    return selMs >= startMs && selMs <= endMs; // 기간이면 그 사이 날짜도 포함
  });
}

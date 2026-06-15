import { y2024, y2025, y2026 } from "@hyunbinseo/holidays-kr";

// 대한민국 공휴일(빨간날) — @hyunbinseo/holidays-kr(관보 기반, 대체공휴일·임시공휴일·
// 설/추석 연휴 포함)의 연도별 데이터를 사용한다. 패키지가 제공하는 최신 연도(현재 2026)
// 까지만 표시되고, 범위를 벗어난 연도는 표시하지 않는다(패키지 업데이트로 연장).
const BY_YEAR: Record<number, Readonly<Record<string, readonly string[]>>> = {
  2024: y2024,
  2025: y2025,
  2026: y2026,
};

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * 해당 날짜의 공휴일명을 반환한다. 공휴일이 아니면 null.
 * 관보 기반 패키지가 제공하는 항목을 그대로 신뢰한다(제헌절은 2026년 공휴일 재지정
 * 등 변화가 데이터에 반영됨 — 임의로 필터링하지 않는다). 같은 날 여러 명칭이면 합친다.
 * @param month 0-based 월(달력 상태와 동일)
 */
export function holidayName(
  year: number,
  month: number,
  day: number
): string | null {
  const data = BY_YEAR[year];
  if (!data) return null;
  const names = data[`${year}-${pad(month + 1)}-${pad(day)}`];
  return names && names.length > 0 ? names.join(", ") : null;
}

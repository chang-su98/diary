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
